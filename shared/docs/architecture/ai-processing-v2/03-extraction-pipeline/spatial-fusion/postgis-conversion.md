# PostGIS Conversion System

**Purpose:** Convert document-relative spatial coordinates to PostGIS-compatible geometry for healthcare provenance  
**Focus:** Spatial data transformation, PostGIS integration, and clinical_fact_sources table population  
**Priority:** PHASE 2+ - Healthcare compliance and regulatory audit requirements  
**Dependencies:** Text alignment engine, spatial coordinates, PostGIS database extension

---

## System Overview

The PostGIS Conversion System transforms document-relative spatial coordinates into PostGIS GEOMETRY objects, enabling Guardian to store precise spatial provenance for clinical facts in compliance with healthcare regulations. This system populates the `bounding_box` GEOMETRY field in the `clinical_fact_sources` table, supporting click-to-zoom functionality and regulatory audit trails.

### PostGIS Integration Architecture
```yaml
spatial_data_pipeline:
  input: "Document-relative spatial coordinates with confidence scores"
  processing_stages:
    - "Coordinate system normalization and validation"
    - "Document spatial reference system establishment"
    - "PostGIS GEOMETRY object creation"
    - "Spatial index optimization for query performance"
    - "Multi-page document coordinate mapping"
  output: "PostGIS GEOMETRY objects for clinical_fact_sources.bounding_box"
  
database_integration:
  target_table: "clinical_fact_sources"
  geometry_column: "bounding_box GEOMETRY(POLYGON, 4326)"
  spatial_reference: "EPSG:4326 (WGS 84) for document coordinate system"
  indexing: "GiST spatial index for optimized spatial queries"
  
compliance_features:
  audit_trail: "Complete spatial transformation audit log"
  precision_tracking: "Coordinate precision and confidence metadata"
  regulatory_access: "Spatial queries for healthcare compliance reporting"
```

---

## Coordinate System Architecture

### Document Spatial Reference System
```typescript
interface DocumentSpatialReference {
  // Document coordinate system definition
  documentSRID: number;                    // Spatial Reference System Identifier
  coordinateUnits: 'pixels' | 'points' | 'millimeters';
  originPosition: 'top-left' | 'bottom-left';
  
  // Document physical properties
  documentDimensions: {
    width: number;                         // Document width in coordinate units
    height: number;                        // Document height in coordinate units
    dpi: number;                          // Dots per inch for pixel conversion
    aspectRatio: number;                  // Width/height ratio
  };
  
  // Multi-page document handling
  pageHandling: {
    coordinateSystem: 'per-page' | 'document-global';
    pageOffsets: PageOffset[];            // Offset for each page in multi-page docs
    pageSequencing: 'vertical' | 'horizontal' | 'custom';
  };
  
  // Transformation parameters
  transformationMatrix: TransformationMatrix; // For complex coordinate transformations
  calibrationPoints: CalibrationPoint[];   // Reference points for accuracy validation
}

class DocumentCoordinateSystem {
  async establishDocumentSpatialReference(
    documentMetadata: DocumentMetadata,
    ocrSpatialData: OCRSpatialData
  ): Promise<DocumentSpatialReference> {
    
    // Determine document coordinate system from OCR data
    const coordinateUnits = this.detectCoordinateUnits(ocrSpatialData);
    const originPosition = this.detectOriginPosition(ocrSpatialData);
    
    // Calculate document dimensions
    const documentDimensions = this.calculateDocumentDimensions(
      documentMetadata,
      ocrSpatialData
    );
    
    // Handle multi-page documents
    const pageHandling = await this.configurePageHandling(
      documentMetadata,
      ocrSpatialData
    );
    
    // Create transformation matrix for coordinate conversion
    const transformationMatrix = this.createTransformationMatrix(
      documentDimensions,
      coordinateUnits,
      originPosition
    );
    
    // Establish calibration points for accuracy validation
    const calibrationPoints = await this.establishCalibrationPoints(
      ocrSpatialData,
      transformationMatrix
    );
    
    return {
      documentSRID: this.generateDocumentSRID(documentMetadata),
      coordinateUnits,
      originPosition,
      documentDimensions,
      pageHandling,
      transformationMatrix,
      calibrationPoints
    };
  }

  private detectCoordinateUnits(ocrData: OCRSpatialData): 'pixels' | 'points' | 'millimeters' {
    // Analyze OCR coordinate magnitudes to determine units
    const coordinates = ocrData.textElements.map(e => ({
      x: e.boundingBox.x,
      y: e.boundingBox.y,
      width: e.boundingBox.width,
      height: e.boundingBox.height
    }));
    
    const maxX = Math.max(...coordinates.map(c => c.x + c.width));
    const maxY = Math.max(...coordinates.map(c => c.y + c.height));
    
    // Heuristic detection based on coordinate ranges
    if (maxX > 5000 || maxY > 5000) {
      return 'pixels';        // Large values suggest pixel coordinates
    } else if (maxX > 500 || maxY > 500) {
      return 'points';        // Medium values suggest point coordinates (1/72 inch)
    } else {
      return 'millimeters';   // Small values suggest millimeter coordinates
    }
  }

  private createTransformationMatrix(
    dimensions: DocumentDimensions,
    units: string,
    origin: string
  ): TransformationMatrix {
    
    // Create transformation matrix for coordinate conversion
    let scaleX = 1;
    let scaleY = 1;
    let translateX = 0;
    let translateY = 0;
    
    // Handle coordinate unit conversion
    if (units === 'pixels' && dimensions.dpi) {
      // Convert pixels to PostGIS coordinate units (assuming mm)
      scaleX = 25.4 / dimensions.dpi;  // mm per pixel
      scaleY = 25.4 / dimensions.dpi;
    } else if (units === 'points') {
      // Convert points to mm (1 point = 1/72 inch = 0.352777 mm)
      scaleX = 0.352777;
      scaleY = 0.352777;
    }
    
    // Handle origin position conversion
    if (origin === 'top-left') {
      // Convert from top-left origin to bottom-left origin (PostGIS standard)
      translateY = dimensions.height * scaleY;
      scaleY = -scaleY;  // Flip Y axis
    }
    
    return {
      scaleX,
      scaleY,
      translateX,
      translateY,
      description: `Transform from ${units} with ${origin} origin to PostGIS coordinates`
    };
  }
}
```

---

## PostGIS Geometry Generation

### POLYGON Geometry Creation
```typescript
class PostGISGeometryGenerator {
  async generatePostGISGeometry(
    spatialAlignment: SpatialAlignment,
    documentSpatialRef: DocumentSpatialReference,
    pageContext: PageContext
  ): Promise<PostGISGeometryData> {
    
    // Transform document coordinates to PostGIS coordinates
    const transformedCoordinates = this.transformCoordinates(
      spatialAlignment.boundingBox,
      documentSpatialRef.transformationMatrix,
      pageContext
    );
    
    // Create PostGIS POLYGON geometry
    const polygonGeometry = this.createPolygonGeometry(transformedCoordinates);
    
    // Generate spatial metadata
    const spatialMetadata = this.generateSpatialMetadata(
      spatialAlignment,
      transformedCoordinates,
      documentSpatialRef
    );
    
    // Validate geometry integrity
    const validationResult = await this.validateGeometry(
      polygonGeometry,
      spatialMetadata
    );
    
    return {
      geometry: polygonGeometry,
      spatialMetadata,
      validationResult,
      confidence: this.calculateGeometryConfidence(
        spatialAlignment.confidence,
        validationResult
      )
    };
  }

  private transformCoordinates(
    boundingBox: BoundingBox,
    transformMatrix: TransformationMatrix,
    pageContext: PageContext
  ): TransformedCoordinates {
    
    // Calculate base coordinates
    let x1 = boundingBox.x;
    let y1 = boundingBox.y;
    let x2 = boundingBox.x + boundingBox.width;
    let y2 = boundingBox.y + boundingBox.height;
    
    // Apply page offset for multi-page documents
    if (pageContext.pageNumber > 1) {
      const pageOffset = this.calculatePageOffset(pageContext, transformMatrix);
      x1 += pageOffset.x;
      y1 += pageOffset.y;
      x2 += pageOffset.x;
      y2 += pageOffset.y;
    }
    
    // Apply transformation matrix
    const transformedCoords = {
      topLeft: {
        x: x1 * transformMatrix.scaleX + transformMatrix.translateX,
        y: y1 * transformMatrix.scaleY + transformMatrix.translateY
      },
      topRight: {
        x: x2 * transformMatrix.scaleX + transformMatrix.translateX,
        y: y1 * transformMatrix.scaleY + transformMatrix.translateY
      },
      bottomRight: {
        x: x2 * transformMatrix.scaleX + transformMatrix.translateX,
        y: y2 * transformMatrix.scaleY + transformMatrix.translateY
      },
      bottomLeft: {
        x: x1 * transformMatrix.scaleX + transformMatrix.translateX,
        y: y2 * transformMatrix.scaleY + transformMatrix.translateY
      }
    };
    
    return transformedCoords;
  }

  private createPolygonGeometry(coords: TransformedCoordinates): PostGISPolygon {
    // Create well-formed PostGIS POLYGON geometry
    // PostGIS requires clockwise vertex ordering for exterior ring
    
    const vertices = [
      coords.bottomLeft,    // Start with bottom-left
      coords.bottomRight,   // Move clockwise to bottom-right
      coords.topRight,      // Up to top-right
      coords.topLeft,       // Left to top-left
      coords.bottomLeft     // Close the ring back to start
    ];
    
    // Format as PostGIS WKT (Well-Known Text)
    const wktCoordinates = vertices
      .map(vertex => `${vertex.x} ${vertex.y}`)
      .join(', ');
    
    const polygonWKT = `POLYGON((${wktCoordinates}))`;
    
    return {
      wkt: polygonWKT,
      wkb: this.convertWKTtoWKB(polygonWKT),  // Well-Known Binary for database storage
      geojson: this.convertToGeoJSON(vertices), // GeoJSON for web applications
      coordinates: vertices,
      boundingBox: this.calculateGeometryBoundingBox(vertices)
    };
  }

  private generateSpatialMetadata(
    alignment: SpatialAlignment,
    coordinates: TransformedCoordinates,
    spatialRef: DocumentSpatialReference
  ): SpatialMetadata {
    
    return {
      // Coordinate system information
      srid: spatialRef.documentSRID,
      coordinateSystem: spatialRef.coordinateUnits,
      transformationApplied: true,
      
      // Spatial properties
      area: this.calculatePolygonArea(coordinates),
      perimeter: this.calculatePolygonPerimeter(coordinates),
      centroid: this.calculateCentroid(coordinates),
      
      // Quality metrics
      alignmentConfidence: alignment.confidence,
      coordinatePrecision: this.calculateCoordinatePrecision(coordinates),
      geometryComplexity: 'simple_polygon',
      
      // Provenance information
      sourceDocument: alignment.sourceDocument,
      extractionMethod: alignment.method,
      transformationTimestamp: new Date(),
      
      // Validation status
      geometryValid: true,
      spatialIndexable: true,
      complianceReady: true
    };
  }

  private async validateGeometry(
    geometry: PostGISPolygon,
    metadata: SpatialMetadata
  ): Promise<GeometryValidationResult> {
    
    const validationChecks: GeometryValidationCheck[] = [];
    
    // Check 1: WKT validity
    const wktValidation = this.validateWKT(geometry.wkt);
    validationChecks.push({
      checkType: 'wkt_validity',
      passed: wktValidation.isValid,
      message: wktValidation.message,
      details: wktValidation.details
    });
    
    // Check 2: Coordinate reasonableness
    const coordinateValidation = this.validateCoordinateReasonableness(
      geometry.coordinates
    );
    validationChecks.push({
      checkType: 'coordinate_reasonableness',
      passed: coordinateValidation.reasonable,
      message: coordinateValidation.message,
      details: coordinateValidation.analysis
    });
    
    // Check 3: Polygon integrity
    const polygonValidation = this.validatePolygonIntegrity(geometry);
    validationChecks.push({
      checkType: 'polygon_integrity',
      passed: polygonValidation.valid,
      message: polygonValidation.message,
      details: polygonValidation.issues
    });
    
    // Check 4: Spatial indexability
    const indexValidation = this.validateSpatialIndexability(geometry);
    validationChecks.push({
      checkType: 'spatial_indexability',
      passed: indexValidation.indexable,
      message: indexValidation.message,
      details: indexValidation.requirements
    });
    
    const overallValid = validationChecks.every(check => check.passed);
    
    return {
      isValid: overallValid,
      validationChecks,
      qualityScore: this.calculateGeometryQuality(validationChecks),
      recommendedActions: this.generateValidationRecommendations(validationChecks)
    };
  }
}
```

---

## Database Integration and Storage

### Clinical Fact Sources Table Population
```typescript
class ClinicalFactSourcesIntegrator {
  async populateClinicalFactSources(
    clinicalFact: ClinicalFact,
    postGISGeometry: PostGISGeometryData,
    documentMetadata: DocumentMetadata,
    spatialAlignment: SpatialAlignment
  ): Promise<ClinicalFactSourceRecord> {
    
    // Generate unique source identifier
    const sourceId = this.generateSourceId(clinicalFact.id, documentMetadata.documentId);
    
    // Create clinical fact source record
    const sourceRecord: ClinicalFactSourceRecord = {
      source_id: sourceId,
      clinical_event_id: clinicalFact.clinicalEventId,
      patient_id: clinicalFact.patientId,
      
      // Document provenance
      source_document_id: documentMetadata.documentId,
      source_document_type: documentMetadata.documentType,
      source_page_number: spatialAlignment.pageNumber || 1,
      source_section: spatialAlignment.documentSection,
      
      // PostGIS spatial data
      bounding_box: postGISGeometry.geometry.wkt,  // GEOMETRY(POLYGON, 4326)
      spatial_confidence: postGISGeometry.confidence,
      coordinate_precision: postGISGeometry.spatialMetadata.coordinatePrecision,
      
      // Extraction provenance
      extraction_method: spatialAlignment.method,
      extraction_confidence: spatialAlignment.confidence,
      extraction_timestamp: new Date(),
      alignment_algorithm: spatialAlignment.alignmentAlgorithm,
      
      // Clinical validation metadata
      medical_review_status: 'pending',
      validation_score: clinicalFact.validationScore,
      quality_flags: this.generateQualityFlags(spatialAlignment, postGISGeometry),
      
      // Spatial metadata
      spatial_metadata: {
        srid: postGISGeometry.spatialMetadata.srid,
        area_square_mm: postGISGeometry.spatialMetadata.area,
        centroid_x: postGISGeometry.spatialMetadata.centroid.x,
        centroid_y: postGISGeometry.spatialMetadata.centroid.y,
        transformation_applied: postGISGeometry.spatialMetadata.transformationApplied
      },
      
      // Compliance and audit
      audit_trail: {
        extractor_version: '2.0',
        spatial_processor_version: '1.0',
        processing_pipeline: spatialAlignment.processingPipeline,
        validation_rules: spatialAlignment.validationRules,
        compliance_framework: ['HIPAA', 'Privacy_Act_1988']
      },
      
      // Performance metrics
      processing_duration_ms: spatialAlignment.processingTime,
      memory_usage_mb: spatialAlignment.memoryUsage,
      
      // Timestamps and versioning
      created_at: new Date(),
      updated_at: new Date(),
      data_version: '1.0',
      retention_category: 'clinical_spatial_provenance'
    };
    
    return sourceRecord;
  }

  async insertWithSpatialOptimization(
    sourceRecords: ClinicalFactSourceRecord[]
  ): Promise<SpatialInsertionResult> {
    
    // Group records for batch insertion
    const batchGroups = this.groupRecordsForBatchInsertion(sourceRecords);
    
    const insertionResults: BatchInsertionResult[] = [];
    
    for (const batch of batchGroups) {
      try {
        // Prepare spatial data for insertion
        const preparedBatch = await this.prepareSpatialBatch(batch);
        
        // Execute batch insertion with spatial optimization
        const batchResult = await this.executeSpatialBatchInsertion(preparedBatch);
        
        insertionResults.push(batchResult);
        
      } catch (error) {
        console.error('Batch insertion failed:', error);
        insertionResults.push({
          batchId: batch.id,
          success: false,
          error: error.message,
          recordCount: batch.records.length
        });
      }
    }
    
    // Update spatial indexes after insertion
    await this.refreshSpatialIndexes();
    
    return {
      totalRecords: sourceRecords.length,
      successfulInsertions: insertionResults.reduce(
        (sum, result) => sum + (result.success ? result.recordCount : 0), 0
      ),
      failedInsertions: insertionResults.reduce(
        (sum, result) => sum + (result.success ? 0 : result.recordCount), 0
      ),
      batchResults: insertionResults,
      spatialIndexStatus: await this.getSpatialIndexStatus()
    };
  }

  private async prepareSpatialBatch(
    batch: ClinicalFactSourceBatch
  ): Promise<PreparedSpatialBatch> {
    
    const preparedRecords = await Promise.all(
      batch.records.map(async record => {
        // Validate PostGIS geometry syntax
        const geometryValidation = await this.validatePostGISGeometry(
          record.bounding_box
        );
        
        if (!geometryValidation.valid) {
          throw new Error(
            `Invalid PostGIS geometry for record ${record.source_id}: ${geometryValidation.error}`
          );
        }
        
        // Convert to binary format for efficient storage
        const binaryGeometry = await this.convertToBinaryGeometry(
          record.bounding_box
        );
        
        return {
          ...record,
          bounding_box_binary: binaryGeometry,
          geometry_validated: true,
          preparation_timestamp: new Date()
        };
      })
    );
    
    return {
      batchId: batch.id,
      records: preparedRecords,
      totalSpatialDataSize: this.calculateSpatialDataSize(preparedRecords),
      estimatedInsertionTime: this.estimateInsertionTime(preparedRecords.length)
    };
  }

  private async executeSpatialBatchInsertion(
    preparedBatch: PreparedSpatialBatch
  ): Promise<BatchInsertionResult> {
    
    const startTime = Date.now();
    
    // Use PostgreSQL COPY for efficient bulk insertion
    const copyCommand = this.generateSpatialCopyCommand(preparedBatch.records);
    
    // Execute with spatial optimization parameters
    const result = await this.database.query(copyCommand, {
      // Spatial-specific optimizations
      enableSequentialScan: false,
      workMem: '256MB',              // Increase memory for spatial operations
      maintenanceWorkMem: '512MB',   // Memory for index maintenance
      randomPageCost: 1.0,           // Optimize for SSD storage
      effectiveCacheSize: '4GB'      // Cache size for spatial indexes
    });
    
    const endTime = Date.now();
    
    return {
      batchId: preparedBatch.batchId,
      success: true,
      recordCount: preparedBatch.records.length,
      insertionTime: endTime - startTime,
      spatialDataProcessed: preparedBatch.totalSpatialDataSize,
      postgisOperations: result.spatialOperationsCount
    };
  }
}
```

---

## Spatial Query Optimization

### PostGIS Performance Enhancement
```typescript
class SpatialQueryOptimizer {
  async optimizeSpatialQueries(): Promise<SpatialOptimizationResult> {
    
    // Create spatial indexes for optimal performance
    const indexCreationResults = await this.createSpatialIndexes();
    
    // Analyze spatial data distribution
    const spatialAnalysis = await this.analyzeSpatialDistribution();
    
    // Optimize query performance parameters
    const queryOptimization = await this.optimizeQueryParameters();
    
    // Create spatial statistics for query planner
    const statisticsUpdate = await this.updateSpatialStatistics();
    
    return {
      indexCreationResults,
      spatialAnalysis,
      queryOptimization,
      statisticsUpdate,
      overallPerformanceImprovement: this.calculatePerformanceImprovement()
    };
  }

  private async createSpatialIndexes(): Promise<SpatialIndexResult[]> {
    const indexCommands = [
      // Primary spatial index on bounding_box
      `CREATE INDEX IF NOT EXISTS idx_clinical_fact_sources_spatial 
       ON clinical_fact_sources USING GIST (bounding_box);`,
      
      // Compound index for spatial + document queries
      `CREATE INDEX IF NOT EXISTS idx_clinical_fact_sources_doc_spatial 
       ON clinical_fact_sources USING GIST (source_document_id, bounding_box);`,
      
      // Index for patient spatial queries
      `CREATE INDEX IF NOT EXISTS idx_clinical_fact_sources_patient_spatial 
       ON clinical_fact_sources USING GIST (patient_id, bounding_box);`,
      
      // Partial index for high-confidence spatial data
      `CREATE INDEX IF NOT EXISTS idx_clinical_fact_sources_high_confidence_spatial 
       ON clinical_fact_sources USING GIST (bounding_box) 
       WHERE spatial_confidence > 0.8;`
    ];
    
    const results: SpatialIndexResult[] = [];
    
    for (const command of indexCommands) {
      try {
        const startTime = Date.now();
        await this.database.query(command);
        const endTime = Date.now();
        
        results.push({
          indexName: this.extractIndexName(command),
          success: true,
          creationTime: endTime - startTime,
          indexType: 'GIST',
          estimatedSize: await this.estimateIndexSize(this.extractIndexName(command))
        });
        
      } catch (error) {
        results.push({
          indexName: this.extractIndexName(command),
          success: false,
          error: error.message,
          creationTime: 0
        });
      }
    }
    
    return results;
  }

  async executeOptimizedSpatialQuery(
    queryParams: SpatialQueryParameters
  ): Promise<SpatialQueryResult> {
    
    // Build optimized spatial query with proper indexes
    const optimizedQuery = this.buildOptimizedSpatialQuery(queryParams);
    
    // Execute with spatial query optimizations
    const queryResult = await this.database.query(optimizedQuery, {
      // Spatial query optimizations
      enableBitmapScan: true,
      enableGISTScan: true,
      effectiveCacheSize: '4GB',
      randomPageCost: 1.0,
      workMem: '256MB'
    });
    
    return {
      results: queryResult.rows,
      queryPlan: queryResult.queryPlan,
      executionTime: queryResult.executionTime,
      spatialOperations: queryResult.spatialOperationsUsed,
      indexesUsed: queryResult.indexesUsed
    };
  }

  private buildOptimizedSpatialQuery(params: SpatialQueryParameters): string {
    let query = `
      SELECT 
        cfs.source_id,
        cfs.clinical_event_id,
        cfs.bounding_box,
        cfs.spatial_confidence,
        ST_Area(cfs.bounding_box) as spatial_area,
        ST_AsGeoJSON(cfs.bounding_box) as geojson
      FROM clinical_fact_sources cfs
      WHERE 1=1
    `;
    
    // Add spatial filters
    if (params.spatialFilter) {
      switch (params.spatialFilter.type) {
        case 'intersects':
          query += ` AND ST_Intersects(cfs.bounding_box, ST_GeomFromText('${params.spatialFilter.geometry}'))`;
          break;
        case 'contains':
          query += ` AND ST_Contains(cfs.bounding_box, ST_GeomFromText('${params.spatialFilter.geometry}'))`;
          break;
        case 'within':
          query += ` AND ST_Within(cfs.bounding_box, ST_GeomFromText('${params.spatialFilter.geometry}'))`;
          break;
        case 'distance':
          query += ` AND ST_DWithin(cfs.bounding_box, ST_GeomFromText('${params.spatialFilter.geometry}'), ${params.spatialFilter.distance})`;
          break;
      }
    }
    
    // Add confidence filter for high-quality spatial data
    if (params.minSpatialConfidence) {
      query += ` AND cfs.spatial_confidence >= ${params.minSpatialConfidence}`;
    }
    
    // Add document filter
    if (params.documentId) {
      query += ` AND cfs.source_document_id = '${params.documentId}'`;
    }
    
    // Add patient filter
    if (params.patientId) {
      query += ` AND cfs.patient_id = '${params.patientId}'`;
    }
    
    // Add ordering for consistent results
    query += ` ORDER BY cfs.spatial_confidence DESC, cfs.created_at DESC`;
    
    // Add limit if specified
    if (params.limit) {
      query += ` LIMIT ${params.limit}`;
    }
    
    return query;
  }
}
```

---

## Click-to-Zoom Integration

### Frontend Spatial Interaction
```typescript
class ClickToZoomIntegration {
  async generateClickToZoomData(
    documentId: string,
    spatialFactSources: ClinicalFactSourceRecord[]
  ): Promise<ClickToZoomData> {
    
    // Convert PostGIS geometries to frontend-compatible coordinates
    const interactiveRegions = await Promise.all(
      spatialFactSources.map(source => this.createInteractiveRegion(source))
    );
    
    // Group regions by document section for optimal UI performance
    const regionGroups = this.groupRegionsBySection(interactiveRegions);
    
    // Generate click handlers for each region
    const clickHandlers = this.generateClickHandlers(regionGroups);
    
    // Create zoom level optimization data
    const zoomOptimization = this.createZoomOptimization(interactiveRegions);
    
    return {
      documentId,
      interactiveRegions,
      regionGroups,
      clickHandlers,
      zoomOptimization,
      spatialMetadata: {
        totalRegions: interactiveRegions.length,
        averageConfidence: this.calculateAverageConfidence(spatialFactSources),
        spatialCoverage: this.calculateSpatialCoverage(interactiveRegions)
      }
    };
  }

  private async createInteractiveRegion(
    source: ClinicalFactSourceRecord
  ): Promise<InteractiveRegion> {
    
    // Convert PostGIS geometry to frontend coordinates
    const frontendCoordinates = await this.convertToFrontendCoordinates(
      source.bounding_box,
      source.spatial_metadata
    );
    
    // Generate region interaction metadata
    const interactionMetadata = {
      clinicalEventId: source.clinical_event_id,
      extractionConfidence: source.extraction_confidence,
      spatialConfidence: source.spatial_confidence,
      extractionMethod: source.extraction_method,
      documentSection: source.source_section,
      pageNumber: source.source_page_number
    };
    
    // Create click action configuration
    const clickAction = {
      type: 'show_clinical_detail',
      targetEventId: source.clinical_event_id,
      highlightRegion: frontendCoordinates,
      zoomLevel: this.calculateOptimalZoomLevel(frontendCoordinates),
      animationDuration: 300
    };
    
    return {
      regionId: source.source_id,
      coordinates: frontendCoordinates,
      interactionMetadata,
      clickAction,
      visualProperties: {
        borderColor: this.getConfidenceColor(source.spatial_confidence),
        borderWidth: 2,
        fillOpacity: 0.1,
        hoverEffect: true,
        accessibilityLabel: `Clinical fact: ${source.clinical_event_id}`
      }
    };
  }

  private async convertToFrontendCoordinates(
    postGISGeometry: string,
    spatialMetadata: SpatialMetadata
  ): Promise<FrontendCoordinates> {
    
    // Parse PostGIS POLYGON geometry
    const coordinates = this.parsePostGISPolygon(postGISGeometry);
    
    // Convert from document coordinate system to frontend viewport coordinates
    const viewportCoordinates = coordinates.map(coord => ({
      x: (coord.x / spatialMetadata.documentWidth) * 100,  // Convert to percentage
      y: (coord.y / spatialMetadata.documentHeight) * 100
    }));
    
    // Calculate bounding rectangle for efficient frontend rendering
    const boundingRect = this.calculateBoundingRect(viewportCoordinates);
    
    return {
      type: 'polygon',
      coordinates: viewportCoordinates,
      boundingRect,
      coordinateSystem: 'viewport_percentage',
      precision: 'sub_pixel'
    };
  }
}
```

---

*The PostGIS Conversion System enables Guardian to provide healthcare-grade spatial provenance for clinical facts, ensuring regulatory compliance through precise document coordinates while supporting advanced spatial queries and interactive click-to-zoom functionality for enhanced user experience.*