# Spatial Precision Requirement (Phase 2+)

**Database Target:** `clinical_fact_sources.bounding_box` (PostGIS GEOMETRY)  
**Priority:** MEDIUM - Phase 2+ enhancement capability  
**Purpose:** Enable click-to-zoom document navigation and complete fact provenance  
**Dependencies:** OCR integration, PostGIS database extension

---

## Requirement Overview

Guardian's spatial precision capability links every extracted clinical fact to its precise location in the source document using PostGIS geometry coordinates. This enables click-to-zoom document navigation, visual fact verification, and complete provenance tracking for healthcare compliance and quality assurance.

### Strategic Value
Spatial precision transforms Guardian from text-based extraction to spatially-aware clinical data processing, enabling advanced document interaction features and providing complete traceability from clinical facts back to their source document locations.

---

## Spatial Processing Architecture

### Core Components

#### OCR Spatial Data Extraction
```yaml
ocr_integration:
  service: "Google Cloud Vision API"
  coordinate_system: "Pixel coordinates relative to document page"
  data_extracted:
    - "Text content with bounding box coordinates"
    - "Page numbers for multi-page documents"  
    - "Confidence scores for OCR text recognition"
    - "Text line and word-level spatial data"
```

#### AI-OCR Text Alignment
```yaml
alignment_process:
  input: "AI extracted facts + OCR spatial data"
  algorithm: "Fuzzy text matching with spatial clustering"
  output: "Clinical facts with document coordinates"
  confidence_scoring: "Alignment quality assessment"
  error_handling: "Graceful degradation for poor OCR"
```

#### PostGIS Geometric Storage
```yaml
spatial_database:
  coordinate_system: "GEOMETRY(POLYGON, 4326)"
  spatial_indexing: "GiST indexes for efficient spatial queries"
  coordinate_transformation: "Document pixels to normalized coordinates"
  multi_page_support: "Page-relative coordinate systems"
```

---

## Technical Implementation Requirements

### OCR Integration and Coordinate Extraction

#### Google Cloud Vision API Integration
```python
class DocumentOCRProcessor:
    def __init__(self, credentials_path):
        self.client = vision.ImageAnnotatorClient.from_service_account_file(credentials_path)
        
    def extract_text_with_coordinates(self, document_image):
        """Extract text with bounding box coordinates from document image"""
        
        # Convert document to image format
        image = vision.Image(content=document_image)
        
        # Perform OCR with text annotation
        response = self.client.document_text_detection(image=image)
        
        # Extract text blocks with spatial data
        text_blocks = []
        for page in response.full_text_annotation.pages:
            for block in page.blocks:
                for paragraph in block.paragraphs:
                    for word in paragraph.words:
                        word_text = ''.join([symbol.text for symbol in word.symbols])
                        
                        # Extract bounding box coordinates
                        vertices = word.bounding_box.vertices
                        bounding_box = {
                            'text': word_text,
                            'coordinates': [
                                {'x': v.x, 'y': v.y} for v in vertices
                            ],
                            'confidence': word.confidence if hasattr(word, 'confidence') else 1.0,
                            'page_number': page.page_info.page_number if hasattr(page, 'page_info') else 1
                        }
                        
                        text_blocks.append(bounding_box)
        
        return text_blocks
```

#### Text Alignment Algorithm
```python
class SpatialTextAligner:
    def __init__(self, similarity_threshold=0.8, spatial_clustering_distance=50):
        self.similarity_threshold = similarity_threshold
        self.clustering_distance = spatial_clustering_distance
        
    def align_ai_facts_to_ocr(self, ai_extracted_facts, ocr_text_blocks):
        """Align AI-extracted clinical facts to OCR spatial data"""
        
        aligned_facts = []
        
        for fact in ai_extracted_facts:
            best_alignment = self.find_best_spatial_alignment(
                fact.source_text, 
                ocr_text_blocks
            )
            
            if best_alignment and best_alignment['confidence'] > self.similarity_threshold:
                spatial_fact = SpatialClinicalFact(
                    clinical_fact=fact,
                    bounding_box=best_alignment['bounding_box'],
                    page_number=best_alignment['page_number'],
                    alignment_confidence=best_alignment['confidence'],
                    ocr_text=best_alignment['ocr_text']
                )
                aligned_facts.append(spatial_fact)
            else:
                # Handle unaligned facts gracefully
                aligned_facts.append(SpatialClinicalFact(
                    clinical_fact=fact,
                    bounding_box=None,  # No spatial data available
                    alignment_confidence=0.0,
                    alignment_status='failed'
                ))
        
        return aligned_facts
    
    def find_best_spatial_alignment(self, ai_text, ocr_blocks):
        """Find best OCR text block match for AI-extracted text"""
        
        best_match = None
        best_score = 0.0
        
        # Group nearby OCR blocks for phrase matching
        text_clusters = self.cluster_nearby_text_blocks(ocr_blocks)
        
        for cluster in text_clusters:
            # Combine clustered text
            combined_text = ' '.join([block['text'] for block in cluster['blocks']])
            
            # Calculate text similarity
            similarity = self.calculate_text_similarity(ai_text, combined_text)
            
            if similarity > best_score:
                best_score = similarity
                best_match = {
                    'ocr_text': combined_text,
                    'bounding_box': self.calculate_cluster_bounding_box(cluster['blocks']),
                    'page_number': cluster['blocks'][0]['page_number'],
                    'confidence': similarity
                }
        
        return best_match
    
    def calculate_text_similarity(self, text1, text2):
        """Calculate similarity between AI text and OCR text"""
        from difflib import SequenceMatcher
        
        # Normalize text for comparison
        norm_text1 = self.normalize_text_for_comparison(text1)
        norm_text2 = self.normalize_text_for_comparison(text2)
        
        # Calculate sequence similarity
        similarity = SequenceMatcher(None, norm_text1, norm_text2).ratio()
        
        return similarity
    
    def cluster_nearby_text_blocks(self, ocr_blocks):
        """Group nearby OCR text blocks for phrase matching"""
        
        clusters = []
        remaining_blocks = ocr_blocks.copy()
        
        while remaining_blocks:
            # Start new cluster with first remaining block
            current_cluster = [remaining_blocks.pop(0)]
            
            # Find nearby blocks to add to cluster
            added_to_cluster = True
            while added_to_cluster:
                added_to_cluster = False
                for i, block in enumerate(remaining_blocks):
                    if self.is_spatially_close(current_cluster, block):
                        current_cluster.append(remaining_blocks.pop(i))
                        added_to_cluster = True
                        break
            
            clusters.append({
                'blocks': current_cluster,
                'page_number': current_cluster[0]['page_number']
            })
        
        return clusters
```

### PostGIS Integration and Coordinate Transformation

#### Coordinate System Transformation
```python
class CoordinateTransformer:
    def __init__(self, document_width, document_height):
        self.document_width = document_width
        self.document_height = document_height
        
    def transform_to_normalized_coordinates(self, pixel_coordinates):
        """Transform pixel coordinates to normalized coordinate system"""
        
        # Normalize to 0-1 coordinate system
        normalized_coords = []
        for coord in pixel_coordinates:
            normalized_x = coord['x'] / self.document_width
            normalized_y = coord['y'] / self.document_height
            normalized_coords.append({'x': normalized_x, 'y': normalized_y})
        
        return normalized_coords
    
    def create_postgis_polygon(self, normalized_coordinates):
        """Create PostGIS POLYGON geometry from normalized coordinates"""
        
        # Format coordinates for PostGIS POLYGON
        coord_string = ', '.join([
            f"{coord['x']} {coord['y']}" for coord in normalized_coordinates
        ])
        
        # Close the polygon by repeating first coordinate
        if normalized_coordinates:
            first_coord = normalized_coordinates[0]
            coord_string += f", {first_coord['x']} {first_coord['y']}"
        
        # Create PostGIS POLYGON in WGS84 coordinate system  
        postgis_geometry = f"POLYGON(({coord_string}))"
        
        return postgis_geometry
```

#### Spatial Database Operations
```sql
-- Create spatial index for efficient spatial queries
CREATE INDEX idx_clinical_fact_sources_spatial 
ON clinical_fact_sources 
USING GIST (bounding_box);

-- Spatial query examples for click-to-zoom functionality
-- Find all clinical facts within a document region
SELECT cfs.*, pce.event_name, pce.activity_type
FROM clinical_fact_sources cfs
JOIN patient_clinical_events pce ON cfs.fact_id = pce.id
WHERE cfs.fact_table = 'patient_clinical_events'
  AND cfs.document_id = $1
  AND ST_Contains(
    ST_GeomFromText('POLYGON((0.2 0.3, 0.8 0.3, 0.8 0.7, 0.2 0.7, 0.2 0.3))', 4326),
    cfs.bounding_box
  );

-- Find clinical facts near a clicked point
SELECT cfs.*, pce.event_name
FROM clinical_fact_sources cfs  
JOIN patient_clinical_events pce ON cfs.fact_id = pce.id
WHERE cfs.document_id = $1
  AND ST_DWithin(
    ST_Centroid(cfs.bounding_box),
    ST_Point($2, $3, 4326),  -- Click coordinates
    0.05  -- 5% tolerance
  )
ORDER BY ST_Distance(ST_Centroid(cfs.bounding_box), ST_Point($2, $3, 4326))
LIMIT 10;
```

---

## Database Integration Specifications

### clinical_fact_sources Table (Enhanced)
```sql
CREATE TABLE clinical_fact_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Fact reference
    fact_table TEXT NOT NULL,           -- Table containing the clinical fact
    fact_id UUID NOT NULL,             -- ID of the clinical fact record
    document_id UUID NOT NULL REFERENCES documents(id),
    
    -- Spatial data (Phase 2+ enhancement)
    page_number INTEGER,                -- Page number in multi-page documents
    bounding_box GEOMETRY(POLYGON, 4326), -- PostGIS spatial coordinates
    
    -- Text alignment data
    source_text TEXT,                   -- Original text from document
    ocr_text TEXT,                      -- OCR extracted text
    ai_extracted_text TEXT,             -- AI processed/normalized text
    
    -- Quality and provenance
    extraction_method TEXT NOT NULL,    -- 'ocr_plus_ai', 'ai_only', 'manual'
    alignment_confidence NUMERIC(4,3),  -- Spatial alignment confidence
    ocr_confidence NUMERIC(4,3),        -- OCR text recognition confidence
    
    -- Processing metadata
    coordinate_system TEXT DEFAULT 'normalized_document', -- Coordinate reference
    transformation_applied BOOLEAN DEFAULT FALSE,         -- Coordinate transformation flag
    spatial_quality_score NUMERIC(4,3),                  -- Overall spatial quality
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_fact_source UNIQUE (fact_table, fact_id, document_id),
    CONSTRAINT valid_alignment_confidence CHECK (alignment_confidence BETWEEN 0 AND 1),
    CONSTRAINT valid_spatial_quality CHECK (spatial_quality_score BETWEEN 0 AND 1),
    
    -- Spatial index
    CONSTRAINT spatial_data_consistency CHECK (
        (bounding_box IS NOT NULL AND page_number IS NOT NULL) OR
        (bounding_box IS NULL AND extraction_method = 'ai_only')
    )
);

-- Create spatial index
CREATE INDEX idx_clinical_fact_sources_spatial 
ON clinical_fact_sources 
USING GIST (bounding_box) 
WHERE bounding_box IS NOT NULL;

-- Create compound indexes for common queries
CREATE INDEX idx_clinical_fact_sources_document_page 
ON clinical_fact_sources (document_id, page_number) 
WHERE page_number IS NOT NULL;
```

### Spatial Processing Session Tracking
```sql
CREATE TABLE spatial_processing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id),
    
    -- Processing statistics
    total_facts_processed INTEGER NOT NULL,
    facts_with_spatial_data INTEGER NOT NULL,
    average_alignment_confidence NUMERIC(4,3),
    
    -- OCR processing results
    ocr_service TEXT NOT NULL,          -- 'google_cloud_vision', 'aws_textract'
    ocr_processing_time_ms INTEGER,
    ocr_text_blocks_extracted INTEGER,
    ocr_average_confidence NUMERIC(4,3),
    
    -- Spatial alignment results
    alignment_algorithm TEXT NOT NULL,  -- Algorithm version used
    successful_alignments INTEGER,
    failed_alignments INTEGER,
    alignment_processing_time_ms INTEGER,
    
    -- Quality metrics
    spatial_coverage_percentage NUMERIC(5,2), -- % of facts with spatial data
    high_confidence_alignments INTEGER,       -- Alignments > 0.9 confidence
    manual_review_required INTEGER,           -- Low confidence alignments
    
    -- Processing environment
    processing_pipeline_version TEXT,
    processor_node_id TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Frontend Integration Requirements

### Click-to-Zoom Document Viewer

#### Spatial Query API
```typescript
// API endpoint for spatial document queries
interface SpatialDocumentAPI {
  // Get clinical facts at clicked coordinates
  getFactsAtPoint(documentId: string, x: number, y: number, tolerance: number): Promise<ClinicalFact[]>;
  
  // Get clinical facts within selected region
  getFactsInRegion(documentId: string, polygon: Coordinate[]): Promise<ClinicalFact[]>;
  
  // Get spatial data for specific clinical fact
  getFactSpatialData(factId: string): Promise<SpatialData>;
  
  // Get document spatial overview
  getDocumentSpatialSummary(documentId: string): Promise<SpatialSummary>;
}

interface ClinicalFact {
  id: string;
  event_name: string;
  activity_type: 'observation' | 'intervention';
  bounding_box: Coordinate[];
  page_number: number;
  confidence_score: number;
  alignment_confidence: number;
}

interface Coordinate {
  x: number;  // 0-1 normalized coordinates
  y: number;  // 0-1 normalized coordinates
}
```

#### Document Viewer Component  
```typescript
interface DocumentViewerProps {
  documentId: string;
  spatialDataEnabled: boolean;
  onFactClick: (fact: ClinicalFact) => void;
}

const SpatialDocumentViewer: React.FC<DocumentViewerProps> = ({ 
  documentId, 
  spatialDataEnabled, 
  onFactClick 
}) => {
  const [spatialFacts, setSpatialFacts] = useState<ClinicalFact[]>([]);
  const [selectedFact, setSelectedFact] = useState<ClinicalFact | null>(null);
  
  const handleDocumentClick = async (event: MouseEvent) => {
    if (!spatialDataEnabled) return;
    
    // Convert click coordinates to normalized document coordinates
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    
    // Query for clinical facts at click location
    const facts = await spatialAPI.getFactsAtPoint(documentId, x, y, 0.02);
    
    if (facts.length > 0) {
      setSelectedFact(facts[0]);
      onFactClick(facts[0]);
    }
  };
  
  const renderSpatialHighlights = () => {
    if (!spatialDataEnabled || !spatialFacts.length) return null;
    
    return spatialFacts.map(fact => (
      <div
        key={fact.id}
        className="spatial-highlight"
        style={{
          position: 'absolute',
          left: `${fact.bounding_box[0].x * 100}%`,
          top: `${fact.bounding_box[0].y * 100}%`,
          width: `${(fact.bounding_box[2].x - fact.bounding_box[0].x) * 100}%`,
          height: `${(fact.bounding_box[2].y - fact.bounding_box[0].y) * 100}%`,
          border: '2px solid blue',
          borderRadius: '3px',
          backgroundColor: 'rgba(0, 100, 255, 0.1)',
          cursor: 'pointer'
        }}
        onClick={() => onFactClick(fact)}
        title={fact.event_name}
      />
    ));
  };
  
  return (
    <div className="spatial-document-viewer" onClick={handleDocumentClick}>
      <DocumentImage documentId={documentId} />
      {renderSpatialHighlights()}
      {selectedFact && (
        <FactDetailsPopover fact={selectedFact} />
      )}
    </div>
  );
};
```

### Mobile-Responsive Spatial Interaction
```typescript
const MobileSpatialViewer: React.FC<DocumentViewerProps> = ({ documentId }) => {
  const [touchStart, setTouchStart] = useState<{x: number, y: number} | null>(null);
  
  const handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };
  
  const handleTouchEnd = async (event: TouchEvent) => {
    if (!touchStart) return;
    
    const touch = event.changedTouches[0];
    const touchEnd = { x: touch.clientX, y: touch.clientY };
    
    // Calculate touch distance for tap vs swipe detection
    const distance = Math.sqrt(
      Math.pow(touchEnd.x - touchStart.x, 2) + 
      Math.pow(touchEnd.y - touchStart.y, 2)
    );
    
    if (distance < 10) { // Tap detected
      // Convert touch coordinates to normalized document coordinates
      const rect = event.currentTarget.getBoundingClientRect();
      const x = touchEnd.x / rect.width;
      const y = touchEnd.y / rect.height;
      
      // Query for clinical facts at touch location
      const facts = await spatialAPI.getFactsAtPoint(documentId, x, y, 0.03); // Larger tolerance for mobile
      
      if (facts.length > 0) {
        showMobileFactModal(facts);
      }
    }
    
    setTouchStart(null);
  };
  
  return (
    <div
      className="mobile-spatial-viewer"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <DocumentImage documentId={documentId} />
      <SpatialFactOverlay facts={spatialFacts} />
    </div>
  );
};
```

---

## Quality Assurance and Validation

### Spatial Alignment Quality Metrics

#### Alignment Accuracy Validation
```python
def validate_spatial_alignment_accuracy(aligned_facts, manual_validation_sample_size=50):
    """Validate accuracy of spatial alignment against manual verification"""
    
    # Select random sample for manual validation
    validation_sample = random.sample(aligned_facts, manual_validation_sample_size)
    
    validation_results = {
        'total_validated': len(validation_sample),
        'correct_alignments': 0,
        'alignment_accuracy_by_confidence': {},
        'quality_issues': []
    }
    
    for fact in validation_sample:
        # Manual validation would be performed by reviewing alignment
        # For automated validation, check consistency indicators
        alignment_quality = assess_alignment_quality(fact)
        
        if alignment_quality['is_correct']:
            validation_results['correct_alignments'] += 1
        else:
            validation_results['quality_issues'].append({
                'fact_id': fact.id,
                'issue_type': alignment_quality['issue_type'],
                'confidence_score': fact.alignment_confidence
            })
        
        # Track accuracy by confidence level
        confidence_range = get_confidence_range(fact.alignment_confidence)
        if confidence_range not in validation_results['alignment_accuracy_by_confidence']:
            validation_results['alignment_accuracy_by_confidence'][confidence_range] = {
                'total': 0, 'correct': 0
            }
        validation_results['alignment_accuracy_by_confidence'][confidence_range]['total'] += 1
        if alignment_quality['is_correct']:
            validation_results['alignment_accuracy_by_confidence'][confidence_range]['correct'] += 1
    
    # Calculate overall accuracy
    validation_results['overall_accuracy'] = (
        validation_results['correct_alignments'] / validation_results['total_validated']
    )
    
    return validation_results

def assess_alignment_quality(spatial_fact):
    """Assess quality of spatial alignment using automated checks"""
    
    quality_indicators = {
        'text_similarity_high': spatial_fact.alignment_confidence > 0.85,
        'bounding_box_reasonable_size': check_bounding_box_size(spatial_fact.bounding_box),
        'spatial_consistency': check_spatial_consistency(spatial_fact),
        'ocr_confidence_adequate': spatial_fact.ocr_confidence > 0.8
    }
    
    # Determine overall alignment quality
    quality_score = sum(quality_indicators.values()) / len(quality_indicators)
    
    return {
        'is_correct': quality_score >= 0.75,
        'quality_score': quality_score,
        'issue_type': identify_primary_issue(quality_indicators) if quality_score < 0.75 else None
    }
```

#### Performance Benchmarking
```python
def benchmark_spatial_processing_performance(test_documents):
    """Benchmark spatial processing performance across document types"""
    
    benchmark_results = {
        'document_types': {},
        'overall_metrics': {
            'total_documents': len(test_documents),
            'total_processing_time': 0,
            'total_facts_processed': 0,
            'successful_alignments': 0
        }
    }
    
    for doc in test_documents:
        start_time = time.time()
        
        # Process document with spatial alignment
        ocr_results = extract_ocr_spatial_data(doc)
        ai_facts = extract_ai_clinical_facts(doc)
        aligned_facts = align_facts_to_spatial_data(ai_facts, ocr_results)
        
        processing_time = time.time() - start_time
        
        # Track metrics by document type
        doc_type = categorize_document_type(doc)
        if doc_type not in benchmark_results['document_types']:
            benchmark_results['document_types'][doc_type] = {
                'count': 0, 'total_time': 0, 'successful_alignments': 0,
                'total_facts': 0, 'alignment_rate': 0
            }
        
        type_metrics = benchmark_results['document_types'][doc_type]
        type_metrics['count'] += 1
        type_metrics['total_time'] += processing_time
        type_metrics['total_facts'] += len(ai_facts)
        type_metrics['successful_alignments'] += len([f for f in aligned_facts if f.bounding_box])
        
        # Update overall metrics
        benchmark_results['overall_metrics']['total_processing_time'] += processing_time
        benchmark_results['overall_metrics']['total_facts_processed'] += len(ai_facts)
        benchmark_results['overall_metrics']['successful_alignments'] += len([
            f for f in aligned_facts if f.bounding_box
        ])
    
    # Calculate performance ratios
    for doc_type, metrics in benchmark_results['document_types'].items():
        metrics['avg_processing_time'] = metrics['total_time'] / metrics['count']
        metrics['alignment_rate'] = metrics['successful_alignments'] / metrics['total_facts']
        metrics['facts_per_second'] = metrics['total_facts'] / metrics['total_time']
    
    return benchmark_results
```

---

## Implementation Examples

### Example 1: Laboratory Report Spatial Processing
```python
# Input: Laboratory report PDF with spatial OCR data
document_spatial_processing = {
    'document_id': 'lab-report-001',
    'ocr_text_blocks': [
        {
            'text': 'Hemoglobin',
            'coordinates': [{'x': 100, 'y': 200}, {'x': 180, 'y': 200}, 
                          {'x': 180, 'y': 220}, {'x': 100, 'y': 220}],
            'confidence': 0.96,
            'page_number': 1
        },
        {
            'text': '7.2 g/dL',
            'coordinates': [{'x': 300, 'y': 200}, {'x': 360, 'y': 200},
                          {'x': 360, 'y': 220}, {'x': 300, 'y': 220}], 
            'confidence': 0.94,
            'page_number': 1
        }
    ],
    'ai_extracted_fact': {
        'event_name': 'Hemoglobin Measurement',
        'source_text': 'Hemoglobin: 7.2 g/dL (Low)',
        'activity_type': 'observation',
        'value_numeric': 7.2,
        'unit': 'g/dL'
    }
}

# Spatial alignment result
spatial_alignment_result = {
    'clinical_fact_id': 'hemoglobin-fact-001',
    'bounding_box': 'POLYGON((0.125 0.267, 0.45 0.267, 0.45 0.293, 0.125 0.293, 0.125 0.267))',
    'page_number': 1,
    'alignment_confidence': 0.91,
    'ocr_text': 'Hemoglobin 7.2 g/dL',
    'spatial_quality_score': 0.89
}
```

### Example 2: Click-to-Zoom User Interaction
```typescript
// User clicks on document at coordinates (0.3, 0.4)
const handleDocumentClick = async (clickX: number, clickY: number) => {
    // Query for clinical facts at click location
    const response = await fetch(`/api/spatial/facts-at-point`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            document_id: 'lab-report-001',
            x: clickX,
            y: clickY,
            tolerance: 0.02,
            page_number: 1
        })
    });
    
    const facts = await response.json();
    
    if (facts.length > 0) {
        // Display fact details in popup
        showFactPopup({
            fact: facts[0],
            click_location: { x: clickX, y: clickY },
            spatial_data: {
                bounding_box: facts[0].bounding_box,
                alignment_confidence: facts[0].alignment_confidence,
                source_text: facts[0].source_text
            }
        });
    }
};

// Expected result for hemoglobin click
const factPopupData = {
    fact: {
        event_name: 'Hemoglobin Measurement',
        value_text: '7.2 g/dL',
        interpretation: 'low',
        loinc_code: '718-7'
    },
    spatial_data: {
        alignment_confidence: 0.91,
        source_text: 'Hemoglobin 7.2 g/dL',
        page_number: 1
    }
};
```

---

## Success Criteria

### Technical Success Metrics
- **85%+ successful spatial alignment** for clear text documents
- **Graceful degradation** for poor OCR quality (< 0.8 OCR confidence)
- **Multi-page document support** with consistent coordinate systems
- **Performance suitable for real-time interaction** (< 2 seconds for click-to-zoom queries)

### User Experience Metrics  
- **Smooth click-to-zoom experience** across desktop and mobile devices
- **Accurate highlighting** of source text regions (< 5% coordinate error)
- **Intuitive spatial interaction** with visual feedback for clickable regions
- **Cross-device compatibility** for spatial document features

### Quality and Compliance Metrics
- **Complete provenance tracking** linking every clinical fact to document location
- **Spatial quality scoring** enabling continuous improvement of alignment algorithms
- **Visual verification support** for manual quality assurance processes
- **Compliance audit trails** with complete spatial document provenance

---

*Spatial precision transforms Guardian's document processing from text-based extraction to spatially-aware clinical data processing, enabling advanced document navigation and providing complete traceability from clinical facts to their precise source locations in medical documents.*