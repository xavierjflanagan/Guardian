/**
 * Format Processor - Usage Examples
 *
 * Shows how the format processor module will be used in the worker
 * and what the developer experience will look like.
 */

import { preprocessForOCR, ProcessedPage, PreprocessResult } from '../format-processor';

/**
 * Example 1: Worker Integration (Main Use Case)
 *
 * This shows how the worker will call the format processor
 * before running OCR.
 */
async function workerIntegrationExample(
  base64FileData: string,
  mimeType: string
): Promise<void> {

  console.log(`Processing file: ${mimeType}`);

  // BEFORE Format Processor (OLD WAY - BROKEN):
  // const ocrResult = await processWithGoogleVisionOCR(base64FileData, mimeType);
  // Problem: Only processes first page of TIFF/PDF

  // AFTER Format Processor (NEW WAY - FIXED):

  // Step 1: Preprocess the file format
  const preprocessed: PreprocessResult = await preprocessForOCR(
    base64FileData,
    mimeType,
    {
      maxWidth: 1600,        // Downscale images
      jpegQuality: 85,       // Quality setting
      correlationId: 'job-123'  // For logging
    }
  );

  console.log(`Preprocessing complete: ${preprocessed.totalPages} pages extracted`);
  console.log(`Conversion applied: ${preprocessed.conversionApplied}`);
  console.log(`Processing time: ${preprocessed.processingTimeMs}ms`);

  // Step 2: Process each page through OCR
  const ocrResults: Array<{ pageNumber: number; text: string }> = [];

  for (const page of preprocessed.pages) {
    console.log(`Running OCR on page ${page.pageNumber}/${preprocessed.totalPages}...`);

    // Send each page to Google Cloud Vision
    const pageOCR = await processWithGoogleVisionOCR(
      page.base64,
      'image/jpeg'  // Always JPEG after preprocessing
    );

    ocrResults.push({
      pageNumber: page.pageNumber,
      text: pageOCR.fullTextAnnotation.text
    });
  }

  // Step 3: Combine OCR results
  const combinedText = ocrResults
    .map(r => r.text)
    .join('\n\n--- Page Break ---\n\n');

  console.log(`Total text extracted: ${combinedText.length} characters`);

  // Step 4: Pass combined OCR to Pass 0.5
  // Pass 0.5 now receives all pages and can detect multiple encounters
}

/**
 * Example 2: 2-Page TIFF (Xavier's Test Case)
 */
async function twoPageTiffExample(): Promise<void> {
  // Input: 2-page TIFF with medication + lab report
  const tiffBase64 = '...'; // Base64 of Xavier_combined_2page_medication_and_lab.tiff

  const result = await preprocessForOCR(tiffBase64, 'image/tiff');

  // Result:
  // {
  //   pages: [
  //     { pageNumber: 1, base64: '...', mime: 'image/jpeg', ... },
  //     { pageNumber: 2, base64: '...', mime: 'image/jpeg', ... }
  //   ],
  //   totalPages: 2,
  //   processingTimeMs: 850,
  //   originalFormat: 'image/tiff',
  //   conversionApplied: true
  // }

  console.assert(result.totalPages === 2, 'Should extract 2 pages');
  console.assert(result.pages[0].pageNumber === 1, 'First page should be page 1');
  console.assert(result.pages[1].pageNumber === 2, 'Second page should be page 2');
  console.assert(result.pages[0].mime === 'image/jpeg', 'Should convert to JPEG');
}

/**
 * Example 3: 142-Page PDF (Large File Test)
 */
async function largePdfExample(): Promise<void> {
  // Input: 142-page hospital encounter PDF
  const pdfBase64 = '...'; // Base64 of 006_Emma_Thompson_Hospital_Encounter_Summary.pdf

  console.log('Starting large PDF extraction...');
  const startTime = Date.now();

  const result = await preprocessForOCR(pdfBase64, 'application/pdf');

  const duration = Date.now() - startTime;

  console.log(`Extracted ${result.totalPages} pages in ${duration}ms`);
  console.log(`Average: ${Math.round(duration / result.totalPages)}ms per page`);

  // Expected:
  // - totalPages: 142
  // - Processing time: < 60 seconds
  // - Each page converted to JPEG
  // - Memory usage: < 500MB

  console.assert(result.totalPages === 142, 'Should extract all 142 pages');
  console.assert(duration < 60000, 'Should complete in < 60 seconds');
}

/**
 * Example 4: Single-Page JPEG (Pass-Through Case)
 */
async function singleJpegExample(): Promise<void> {
  // Input: Single JPEG image
  const jpegBase64 = '...'; // Base64 of Xavier_medication_box_IMG_6161.jpeg

  const result = await preprocessForOCR(jpegBase64, 'image/jpeg');

  // Result:
  // {
  //   pages: [
  //     { pageNumber: 1, base64: '...' (same as input), mime: 'image/jpeg', ... }
  //   ],
  //   totalPages: 1,
  //   processingTimeMs: 5,  // Minimal processing
  //   originalFormat: 'image/jpeg',
  //   conversionApplied: false  // No conversion needed
  // }

  console.assert(result.totalPages === 1, 'Should have 1 page');
  console.assert(result.conversionApplied === false, 'No conversion for JPEG');
  console.assert(result.processingTimeMs < 100, 'Should be very fast (pass-through)');
}

/**
 * Example 5: HEIC Conversion (Phase 3)
 */
async function heicConversionExample(): Promise<void> {
  // Input: iPhone HEIC photo
  const heicBase64 = '...'; // Base64 of IMG_6161.heic

  const result = await preprocessForOCR(heicBase64, 'image/heic');

  // Result:
  // {
  //   pages: [
  //     { pageNumber: 1, base64: '...', mime: 'image/jpeg', ... }
  //   ],
  //   totalPages: 1,
  //   processingTimeMs: 500,  // HEIC → JPEG conversion
  //   originalFormat: 'image/heic',
  //   conversionApplied: true
  // }

  console.assert(result.totalPages === 1, 'HEIC is single-page');
  console.assert(result.pages[0].mime === 'image/jpeg', 'Converted to JPEG');
  console.assert(result.conversionApplied === true, 'Conversion applied');
}

/**
 * Example 6: Error Handling
 */
async function errorHandlingExample(): Promise<void> {
  try {
    // Unsupported format
    await preprocessForOCR('...', 'application/vnd.ms-word');
  } catch (error) {
    console.error('Expected error:', error.message);
    // "Unsupported format for OCR: application/vnd.ms-word"
  }

  try {
    // Corrupted file
    await preprocessForOCR('invalid-base64', 'image/tiff');
  } catch (error) {
    console.error('Expected error:', error.message);
    // Sharp or format-specific error
  }
}

/**
 * Placeholder OCR function (for examples)
 */
async function processWithGoogleVisionOCR(
  base64: string,
  mimeType: string
): Promise<{ fullTextAnnotation: { text: string } }> {
  // Placeholder
  return {
    fullTextAnnotation: {
      text: 'Sample OCR text...'
    }
  };
}

/**
 * Developer Experience Summary:
 *
 * BEFORE Format Processor:
 * - Developer had to worry about format support
 * - Multi-page files silently lost data
 * - Different handling for each format
 * - Lots of format-specific code
 *
 * AFTER Format Processor:
 * - Single `preprocessForOCR()` call handles everything
 * - All formats converted to JPEG pages
 * - Transparent to the developer
 * - Consistent interface for all formats
 * - Just iterate through pages and send to OCR
 */
