# Text Extraction - Stage 2 Processing

**Purpose:** Extract text content from documents using OCR and AI processing  
**Position:** Stage 2 of the extraction pipeline  
**Dependencies:** Document ingestion, preprocessed documents, OCR services  
**Output:** Raw text with confidence scores and spatial coordinates

---

## Overview

Text extraction is the second stage of Guardian's AI processing pipeline, responsible for converting preprocessed documents into machine-readable text using Optical Character Recognition (OCR) technologies and AI-enhanced text processing. This stage produces the raw text content that serves as input for clinical data extraction and analysis.

### Text Extraction Objectives
```yaml
primary_goals:
  accuracy: "Extract text with high fidelity to source documents"
  completeness: "Capture all relevant medical text content"
  spatial_awareness: "Maintain coordinate information for click-to-zoom features"
  confidence_scoring: "Provide reliability metrics for extracted text"
  multi_format_support: "Handle diverse document types and layouts"
```

---

## Text Extraction Architecture

### OCR Technology Stack
```yaml
primary_ocr_engine:
  service: "Google Cloud Vision API"
  capabilities:
    - "High-accuracy text recognition"
    - "Medical terminology optimization"
    - "Multi-language support (English primary)"
    - "Spatial coordinate extraction"
    - "Confidence scoring per word/line"
    
  configuration:
    accuracy_mode: "ACCURATE_TEXT"
    language_hints: ["en", "medical_terminology"]
    enable_spatial_data: true
    confidence_threshold: 0.6

fallback_ocr_engine:
  service: "AWS Textract" 
  use_cases:
    - "Google Cloud Vision API unavailable"
    - "Specialized form processing"
    - "Complex table extraction"
  
  capabilities:
    - "Form and table structure recognition"
    - "Key-value pair extraction"
    - "Multi-page document processing"
```

### Text Processing Pipeline
```yaml
stage_1_ocr_processing:
  input: "Preprocessed document images/PDFs"
  process: "OCR text recognition with spatial coordinates"
  output: "Raw text blocks with position data and confidence scores"
  
stage_2_text_consolidation:
  input: "Raw OCR text blocks"
  process: "Merge text blocks into coherent content"
  output: "Consolidated text with structure preservation"
  
stage_3_quality_assessment:
  input: "Consolidated text content"
  process: "Text quality analysis and confidence validation"
  output: "Quality-scored text ready for clinical processing"
  
stage_4_enhancement:
  input: "Quality-assessed text"
  process: "AI-enhanced text correction and medical term optimization"
  output: "Enhanced text optimized for clinical extraction"
```

---

## OCR Processing Implementation

### Google Cloud Vision Integration
```python
class GoogleVisionOCRProcessor:
    def __init__(self, credentials_path):
        self.client = vision.ImageAnnotatorClient.from_service_account_file(credentials_path)
        self.processing_config = {
            'language_hints': ['en'],
            'enable_text_detection_confidence': True,
            'enable_spatial_coordinates': True
        }
    
    def extract_text_with_spatial_data(self, document_image):
        """Extract text with bounding box coordinates and confidence scores"""
        
        # Configure OCR request
        image = vision.Image(content=document_image)
        features = [vision.Feature(type_=vision.Feature.Type.DOCUMENT_TEXT_DETECTION)]
        
        # Execute OCR with configuration
        request = vision.AnnotateImageRequest(
            image=image,
            features=features,
            image_context=vision.ImageContext(
                language_hints=self.processing_config['language_hints']
            )
        )
        
        response = self.client.annotate_image(request=request)
        
        if response.error.message:
            raise OCRProcessingError(f"OCR failed: {response.error.message}")
        
        return self.process_ocr_response(response)
    
    def process_ocr_response(self, response):
        """Process OCR response into structured text data"""
        
        extracted_text_data = {
            'full_text': response.full_text_annotation.text,
            'text_blocks': [],
            'overall_confidence': 0.0,
            'page_count': len(response.full_text_annotation.pages)
        }
        
        confidence_scores = []
        
        # Process each page
        for page_idx, page in enumerate(response.full_text_annotation.pages):
            page_data = {
                'page_number': page_idx + 1,
                'page_width': page.width,
                'page_height': page.height,
                'text_blocks': []
            }
            
            # Process text blocks within page
            for block in page.blocks:
                for paragraph in block.paragraphs:
                    paragraph_text = ""
                    paragraph_confidence_scores = []
                    
                    for word in paragraph.words:
                        word_text = ''.join([symbol.text for symbol in word.symbols])
                        word_confidence = getattr(word, 'confidence', 0.0)
                        
                        # Extract bounding box coordinates
                        vertices = word.bounding_box.vertices
                        bounding_box = [
                            {'x': vertex.x, 'y': vertex.y} for vertex in vertices
                        ]
                        
                        word_data = {
                            'text': word_text,
                            'confidence': word_confidence,
                            'bounding_box': bounding_box
                        }
                        
                        paragraph_text += word_text + " "
                        paragraph_confidence_scores.append(word_confidence)
                    
                    # Calculate paragraph confidence
                    paragraph_confidence = (
                        sum(paragraph_confidence_scores) / len(paragraph_confidence_scores)
                        if paragraph_confidence_scores else 0.0
                    )
                    
                    block_data = {
                        'text': paragraph_text.strip(),
                        'confidence': paragraph_confidence,
                        'bounding_box': self.calculate_block_bounding_box(paragraph)
                    }
                    
                    page_data['text_blocks'].append(block_data)
                    confidence_scores.append(paragraph_confidence)
            
            extracted_text_data['text_blocks'].append(page_data)
        
        # Calculate overall confidence
        extracted_text_data['overall_confidence'] = (
            sum(confidence_scores) / len(confidence_scores)
            if confidence_scores else 0.0
        )
        
        return extracted_text_data
```

### Multi-Page Document Handling
```python
class MultiPageDocumentProcessor:
    def __init__(self, ocr_processor):
        self.ocr_processor = ocr_processor
        
    def process_multi_page_document(self, document_path):
        """Process multi-page documents with page-by-page OCR"""
        
        # Convert PDF to images or handle multi-page TIFF
        page_images = self.extract_pages(document_path)
        
        multi_page_results = {
            'pages': [],
            'consolidated_text': "",
            'overall_confidence': 0.0,
            'processing_metadata': {
                'total_pages': len(page_images),
                'successful_pages': 0,
                'failed_pages': []
            }
        }
        
        page_confidences = []
        
        for page_idx, page_image in enumerate(page_images):
            try:
                # Process individual page
                page_ocr_result = self.ocr_processor.extract_text_with_spatial_data(page_image)
                
                # Add page-specific metadata
                page_result = {
                    'page_number': page_idx + 1,
                    'text_content': page_ocr_result['full_text'],
                    'text_blocks': page_ocr_result['text_blocks'][0] if page_ocr_result['text_blocks'] else [],
                    'page_confidence': page_ocr_result['overall_confidence'],
                    'processing_status': 'success'
                }
                
                multi_page_results['pages'].append(page_result)
                multi_page_results['consolidated_text'] += page_ocr_result['full_text'] + "\n\n"
                page_confidences.append(page_ocr_result['overall_confidence'])
                multi_page_results['processing_metadata']['successful_pages'] += 1
                
            except Exception as e:
                # Handle page processing failures gracefully
                failed_page = {
                    'page_number': page_idx + 1,
                    'processing_status': 'failed',
                    'error_message': str(e)
                }
                
                multi_page_results['pages'].append(failed_page)
                multi_page_results['processing_metadata']['failed_pages'].append(page_idx + 1)
                
                logging.warning(f"Failed to process page {page_idx + 1}: {e}")
        
        # Calculate overall document confidence
        if page_confidences:
            multi_page_results['overall_confidence'] = sum(page_confidences) / len(page_confidences)
        
        return multi_page_results
```

---

## Text Quality Assessment

### Confidence Scoring Framework
```yaml
confidence_metrics:
  word_level_confidence:
    description: "OCR confidence for individual words"
    range: "0.0 to 1.0"
    interpretation:
      high_confidence: ">= 0.9 (reliable text)"
      medium_confidence: "0.7 - 0.89 (good quality)"
      low_confidence: "< 0.7 (may need review)"
      
  paragraph_level_confidence:
    description: "Average confidence for text blocks"
    calculation: "Mean of word confidences within block"
    use_case: "Content section reliability assessment"
    
  document_level_confidence:
    description: "Overall OCR reliability for entire document"
    calculation: "Weighted average of paragraph confidences"
    threshold: ">= 0.8 for automatic processing"
```

### Text Quality Validation
```python
class TextQualityAssessment:
    def __init__(self):
        self.quality_thresholds = {
            'minimum_confidence': 0.6,
            'optimal_confidence': 0.8,
            'medical_terminology_boost': 0.1
        }
        
    def assess_text_quality(self, extracted_text_data):
        """Comprehensive text quality assessment"""
        
        quality_metrics = {
            'overall_score': 0.0,
            'confidence_distribution': {},
            'content_analysis': {},
            'processing_recommendations': []
        }
        
        # Analyze confidence distribution
        all_confidences = self.extract_all_confidence_scores(extracted_text_data)
        quality_metrics['confidence_distribution'] = self.analyze_confidence_distribution(all_confidences)
        
        # Content quality analysis
        text_content = extracted_text_data['consolidated_text']
        quality_metrics['content_analysis'] = self.analyze_content_quality(text_content)
        
        # Medical terminology detection
        medical_term_analysis = self.assess_medical_terminology(text_content)
        quality_metrics['medical_content_score'] = medical_term_analysis['medical_density']
        
        # Calculate overall quality score
        quality_metrics['overall_score'] = self.calculate_overall_quality_score(
            quality_metrics['confidence_distribution'],
            quality_metrics['content_analysis'],
            medical_term_analysis
        )
        
        # Generate processing recommendations
        quality_metrics['processing_recommendations'] = self.generate_recommendations(quality_metrics)
        
        return quality_metrics
    
    def analyze_confidence_distribution(self, confidences):
        """Analyze distribution of OCR confidence scores"""
        
        if not confidences:
            return {'average': 0.0, 'distribution': {}}
        
        distribution = {
            'high_confidence': len([c for c in confidences if c >= 0.9]) / len(confidences),
            'medium_confidence': len([c for c in confidences if 0.7 <= c < 0.9]) / len(confidences),
            'low_confidence': len([c for c in confidences if c < 0.7]) / len(confidences),
            'average': sum(confidences) / len(confidences),
            'minimum': min(confidences),
            'maximum': max(confidences)
        }
        
        return distribution
    
    def analyze_content_quality(self, text_content):
        """Analyze extracted text content for quality indicators"""
        
        content_metrics = {
            'character_count': len(text_content),
            'word_count': len(text_content.split()),
            'line_count': len(text_content.split('\n')),
            'content_density': self.calculate_content_density(text_content),
            'readability_score': self.calculate_readability(text_content),
            'medical_indicators': self.detect_medical_patterns(text_content)
        }
        
        return content_metrics
    
    def assess_medical_terminology(self, text_content):
        """Assess presence and quality of medical terminology"""
        
        medical_patterns = {
            'laboratory_terms': r'\b(hemoglobin|glucose|cholesterol|creatinine|bilirubin)\b',
            'medication_terms': r'\b(mg|ml|tablet|capsule|dose|prescription)\b',
            'clinical_terms': r'\b(diagnosis|symptoms|treatment|examination|procedure)\b',
            'anatomical_terms': r'\b(heart|lung|liver|kidney|brain|chest|abdomen)\b'
        }
        
        medical_matches = {}
        total_matches = 0
        
        for category, pattern in medical_patterns.items():
            matches = re.findall(pattern, text_content, re.IGNORECASE)
            medical_matches[category] = len(matches)
            total_matches += len(matches)
        
        word_count = len(text_content.split())
        medical_density = total_matches / word_count if word_count > 0 else 0.0
        
        return {
            'medical_matches': medical_matches,
            'total_medical_terms': total_matches,
            'medical_density': medical_density,
            'is_medical_document': medical_density > 0.05  # 5% medical terms threshold
        }
```

---

## Text Enhancement and Correction

### AI-Powered Text Enhancement
```yaml
enhancement_strategies:
  ocr_error_correction:
    method: "Machine learning models trained on medical text"
    focus: "Common OCR errors in medical terminology"
    examples:
      - "Hernoglobin → Hemoglobin"
      - "Hlood pressure → Blood pressure"  
      - "Prescrption → Prescription"
      
  medical_terminology_optimization:
    method: "Medical dictionary lookup and correction"
    focus: "Standardize medical abbreviations and terms"
    examples:
      - "BP → Blood Pressure"
      - "CBC → Complete Blood Count"
      - "Hgb → Hemoglobin"
      
  context_aware_correction:
    method: "NLP context analysis for ambiguous text"
    focus: "Resolve unclear text using medical context"
    examples:
      - "Patient reports shortness of [breath/breast]"
      - "Blood glucose [120/I20] mg/dL"
```

### Text Enhancement Implementation
```python
class MedicalTextEnhancer:
    def __init__(self):
        self.medical_dictionary = self.load_medical_dictionary()
        self.common_corrections = self.load_ocr_correction_patterns()
        self.abbreviation_expansions = self.load_medical_abbreviations()
        
    def enhance_extracted_text(self, extracted_text_data, quality_metrics):
        """Apply AI-powered text enhancement based on quality assessment"""
        
        enhancement_results = {
            'original_text': extracted_text_data['consolidated_text'],
            'enhanced_text': "",
            'applied_corrections': [],
            'enhancement_confidence': 0.0
        }
        
        text_content = extracted_text_data['consolidated_text']
        
        # Apply enhancement based on quality thresholds
        if quality_metrics['overall_score'] < 0.8:
            # Apply aggressive enhancement for low-quality text
            enhanced_text = self.apply_comprehensive_enhancement(text_content)
        else:
            # Apply conservative enhancement for good-quality text
            enhanced_text = self.apply_conservative_enhancement(text_content)
        
        enhancement_results['enhanced_text'] = enhanced_text
        enhancement_results['applied_corrections'] = self.track_applied_corrections(text_content, enhanced_text)
        enhancement_results['enhancement_confidence'] = self.calculate_enhancement_confidence(
            quality_metrics['overall_score'],
            len(enhancement_results['applied_corrections'])
        )
        
        return enhancement_results
    
    def apply_comprehensive_enhancement(self, text):
        """Apply multiple enhancement techniques for low-quality text"""
        
        enhanced_text = text
        
        # Step 1: Common OCR error correction
        enhanced_text = self.correct_common_ocr_errors(enhanced_text)
        
        # Step 2: Medical terminology standardization
        enhanced_text = self.standardize_medical_terminology(enhanced_text)
        
        # Step 3: Context-aware corrections
        enhanced_text = self.apply_context_corrections(enhanced_text)
        
        # Step 4: Medical abbreviation expansion
        enhanced_text = self.expand_medical_abbreviations(enhanced_text)
        
        return enhanced_text
    
    def correct_common_ocr_errors(self, text):
        """Correct common OCR misreading patterns in medical text"""
        
        corrections = {
            # Character substitution errors
            r'\bHernoglobin\b': 'Hemoglobin',
            r'\bBlood pr0ssure\b': 'Blood pressure',
            r'\bGluc0se\b': 'Glucose',
            r'\b1nsulin\b': 'Insulin',
            
            # Number/letter confusion
            r'\b(\d+)I(\d+)\b': r'\1l\2',  # 1 mistaken for I
            r'\bO(\d+)\b': r'0\1',         # O mistaken for 0
            
            # Medical term patterns
            r'\bPatient\s+rep0rts\b': 'Patient reports',
            r'\bExarnination\b': 'Examination'
        }
        
        enhanced_text = text
        for pattern, replacement in corrections.items():
            enhanced_text = re.sub(pattern, replacement, enhanced_text, flags=re.IGNORECASE)
        
        return enhanced_text
    
    def standardize_medical_terminology(self, text):
        """Standardize medical terminology to preferred forms"""
        
        standardizations = {
            # Prefer full terms over abbreviations in clinical context
            r'\bHTN\b': 'Hypertension',
            r'\bDM\b': 'Diabetes Mellitus', 
            r'\bCAD\b': 'Coronary Artery Disease',
            r'\bCOPD\b': 'Chronic Obstructive Pulmonary Disease',
            
            # Standardize medication units
            r'\bmg/dl\b': 'mg/dL',
            r'\bml\b': 'mL',
            r'\bkg\b': 'kg'
        }
        
        enhanced_text = text
        for pattern, replacement in standardizations.items():
            enhanced_text = re.sub(pattern, replacement, enhanced_text, flags=re.IGNORECASE)
        
        return enhanced_text
```

---

## Error Handling and Quality Control

### OCR Processing Errors
```yaml
error_categories:
  service_availability_errors:
    description: "OCR service unavailable or rate limited"
    handling: "Fallback to secondary OCR service, retry with backoff"
    recovery: "Queue for processing when service restored"
    
  document_processing_errors:
    description: "Document format or content prevents OCR processing"
    handling: "Alternative processing methods, format conversion attempts"
    recovery: "Manual intervention or document resubmission guidance"
    
  low_quality_extraction:
    description: "OCR confidence below acceptable thresholds"
    handling: "Text enhancement, manual review flagging"
    recovery: "Human verification for critical medical content"
```

### Quality Control Gates
```yaml
processing_gates:
  minimum_confidence_gate:
    threshold: 0.6
    action: "Flag for manual review if below threshold"
    bypass: "User can accept low-quality text with warnings"
    
  medical_content_gate:
    threshold: "Medical terminology density > 3%"
    action: "Validate as medical document, apply medical enhancements"
    bypass: "Process as general document if medical content not detected"
    
  completeness_gate:
    threshold: "Minimum 50 words extracted"
    action: "Ensure sufficient content for clinical processing"
    bypass: "Allow minimal documents with user confirmation"
```

---

## Performance and Optimization

### Processing Performance
```yaml
performance_targets:
  single_page_ocr: 8_seconds          # Average OCR processing time
  multi_page_processing: 5_pages_per_minute
  text_enhancement: 2_seconds         # Additional enhancement processing
  overall_stage_2_completion: 12_seconds # Total text extraction time

optimization_strategies:
  parallel_processing:
    - "Multi-page documents processed concurrently"
    - "OCR and enhancement pipelines run in parallel"
    - "Batch processing for multiple documents"
    
  caching_mechanisms:
    - "OCR results cached for identical documents"
    - "Enhanced text patterns cached for reuse"
    - "Medical terminology lookups cached"
    
  resource_management:
    - "OCR service rate limit management"
    - "Memory optimization for large documents"
    - "Efficient image processing pipelines"
```

### API Rate Limit Management
```python
class OCRServiceManager:
    def __init__(self):
        self.rate_limits = {
            'google_vision': {'requests_per_minute': 600, 'requests_per_day': 100000},
            'aws_textract': {'requests_per_minute': 100, 'requests_per_day': 10000}
        }
        self.request_tracking = {}
        
    def execute_ocr_request(self, service, request_function, *args, **kwargs):
        """Execute OCR request with rate limit management"""
        
        # Check rate limits
        if not self.check_rate_limits(service):
            if service == 'google_vision':
                # Fallback to AWS Textract
                return self.execute_ocr_request('aws_textract', request_function, *args, **kwargs)
            else:
                # Wait for rate limit reset
                self.wait_for_rate_limit_reset(service)
        
        # Execute request with retry logic
        return self.execute_with_retry(request_function, *args, **kwargs)
```

---

## Database Integration

### Text Extraction Results Storage
```sql
-- Store text extraction results
INSERT INTO document_text_extraction (
    document_id,
    extraction_method,           -- 'google_vision', 'aws_textract'
    extracted_text,             -- Full document text content
    confidence_score,           -- Overall OCR confidence
    spatial_data,               -- JSON with bounding box coordinates
    processing_metadata,        -- OCR service response details
    enhancement_applied,        -- Whether text enhancement was used
    enhanced_text,              -- AI-enhanced version (if applicable)
    extraction_timestamp
) VALUES (
    $1::UUID,
    $2::TEXT,
    $3::TEXT,
    $4::NUMERIC,
    $5::JSONB,
    $6::JSONB,
    $7::BOOLEAN,
    $8::TEXT,
    NOW()
);

-- Track processing quality metrics
INSERT INTO text_extraction_quality (
    document_id,
    total_pages_processed,
    successful_pages,
    failed_pages,
    average_confidence,
    medical_content_detected,
    enhancement_confidence,
    processing_warnings
) VALUES (
    $1::UUID,
    $2::INTEGER,
    $3::INTEGER,
    $4::INTEGER,
    $5::NUMERIC,
    $6::BOOLEAN,
    $7::NUMERIC,
    $8::JSONB
);
```

---

## Integration Points

### Pipeline Integration
```yaml
upstream_dependencies:
  document_ingestion: "Preprocessed documents with quality assessment"
  file_storage: "Optimized document files ready for OCR"
  user_profiles: "Patient profile assignment for processing context"

downstream_consumers:
  clinical_extraction: "Raw and enhanced text for medical concept extraction"
  normalization: "Text content for clinical classification and coding"
  validation: "Extracted text for clinical accuracy verification"
```

### External Service Integration
```yaml
ocr_services:
  google_cloud_vision:
    endpoint: "https://vision.googleapis.com/v1/images:annotate"
    authentication: "Service account key"
    features: ["DOCUMENT_TEXT_DETECTION", "TEXT_DETECTION"]
    
  aws_textract:
    endpoint: "https://textract.us-east-1.amazonaws.com/"
    authentication: "IAM role or access keys"
    features: ["FORMS", "TABLES", "QUERIES"]
```

---

*Text extraction transforms Guardian's document images into machine-readable medical text, providing the foundation for clinical data extraction while maintaining spatial awareness and quality metrics necessary for accurate healthcare information processing.*