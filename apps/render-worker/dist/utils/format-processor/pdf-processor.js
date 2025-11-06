"use strict";
/**
 * PDF Page Extraction Processor
 *
 * Extracts all pages from multi-page PDF files and converts them to JPEG.
 * Uses Poppler (via node-poppler) for PDF rendering.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPdfPages = extractPdfPages;
const node_poppler_1 = require("node-poppler");
// MEMORY OPTIMIZATION: Lazy load Sharp only when needed (saves ~60MB at startup)
// import sharp from 'sharp';  // OLD: Eager load
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const crypto_1 = require("crypto");
// Lazy loader for Sharp - only loads when first PDF is processed
let sharpInstance = null;
async function getSharp() {
    if (!sharpInstance) {
        sharpInstance = (await Promise.resolve().then(() => __importStar(require('sharp')))).default;
    }
    return sharpInstance;
}
/**
 * Extract all pages from a PDF file
 *
 * @param base64Pdf - Base64-encoded PDF data
 * @param maxWidth - Optional maximum width for downscaling (default: 1600)
 * @param quality - JPEG quality 1-100 (default: 85)
 * @param correlationId - Optional correlation ID for logging
 * @returns Array of processed pages
 */
async function extractPdfPages(base64Pdf, maxWidth = 1600, quality = 85, correlationId) {
    const startTime = Date.now();
    const sessionId = (0, crypto_1.randomUUID)();
    // Create temp directory for this extraction session
    const tempDir = (0, path_1.join)((0, os_1.tmpdir)(), `pdf-extract-${sessionId}`);
    await fs_1.promises.mkdir(tempDir, { recursive: true });
    let tempPdfPath;
    const tempImagePaths = [];
    try {
        // Step 1: Write PDF buffer to temp file
        const pdfBuffer = Buffer.from(base64Pdf, 'base64');
        tempPdfPath = (0, path_1.join)(tempDir, 'input.pdf');
        await fs_1.promises.writeFile(tempPdfPath, pdfBuffer);
        console.log(`[PDF Processor] Starting PDF extraction`, {
            correlationId,
            sessionId,
            pdfSizeBytes: pdfBuffer.length,
        });
        // Step 2: Initialize Poppler and extract pages
        const poppler = new node_poppler_1.Poppler();
        const outputPrefix = (0, path_1.join)(tempDir, 'page');
        // Use pdfToPpm with JPEG output for page-by-page extraction
        const options = {
            jpegFile: true, // Output as JPEG
            singleFile: false, // Generate separate files per page
            resolutionXYAxis: 200, // 200 DPI for good quality
        };
        console.log(`[PDF Processor] Calling Poppler pdfToPpm`, {
            correlationId,
            sessionId,
            options,
        });
        // Extract pages (poppler generates files: page-1.jpg, page-2.jpg, etc.)
        await poppler.pdfToPpm(tempPdfPath, outputPrefix, options);
        // Step 3: Find all generated page files
        const dirEntries = await fs_1.promises.readdir(tempDir);
        const pageFiles = dirEntries
            .filter((name) => name.startsWith('page-') && name.endsWith('.jpg'))
            .sort((a, b) => {
            // Extract page numbers from filenames (page-1.jpg, page-2.jpg, etc.)
            const numA = parseInt(a.match(/page-(\d+)/)?.[1] || '0', 10);
            const numB = parseInt(b.match(/page-(\d+)/)?.[1] || '0', 10);
            return numA - numB;
        });
        if (pageFiles.length === 0) {
            throw new Error('No pages extracted from PDF');
        }
        console.log(`[PDF Processor] Extracted ${pageFiles.length} pages`, {
            correlationId,
            sessionId,
            pageCount: pageFiles.length,
        });
        // Step 4: Process each extracted page (with per-page error handling)
        const pages = [];
        const pageErrors = [];
        for (let i = 0; i < pageFiles.length; i++) {
            const pageFile = pageFiles[i];
            const pagePath = (0, path_1.join)(tempDir, pageFile);
            tempImagePaths.push(pagePath);
            const pageStartTime = Date.now();
            const pageNumber = i + 1;
            console.log(`[PDF Processor] Processing page ${pageNumber}/${pageFiles.length}`, {
                correlationId,
                sessionId,
                pageNumber,
                filename: pageFile,
            });
            try {
                // Read the extracted JPEG
                const pageBuffer = await fs_1.promises.readFile(pagePath);
                // Load with Sharp for potential downscaling (lazy loaded)
                const sharp = await getSharp();
                const pageImage = sharp(pageBuffer);
                const pageMeta = await pageImage.metadata();
                // Build processing pipeline with EXIF auto-rotation
                let pipeline = pageImage.rotate(); // Auto-rotate using EXIF orientation
                // Optional: Downscale if needed
                if (maxWidth && pageMeta.width && pageMeta.width > maxWidth) {
                    console.log(`[PDF Processor] Downscaling page ${pageNumber} from ${pageMeta.width}px to ${maxWidth}px`, {
                        correlationId,
                        sessionId,
                        pageNumber,
                        originalWidth: pageMeta.width,
                        targetWidth: maxWidth,
                    });
                    pipeline = pipeline.resize({
                        width: maxWidth,
                        withoutEnlargement: true,
                        kernel: 'lanczos3', // High-quality resampling
                    });
                }
                // Convert to JPEG with specified quality
                const jpegBuffer = await pipeline
                    .jpeg({
                    quality,
                    chromaSubsampling: '4:4:4', // Best quality
                    mozjpeg: true, // Better compression
                })
                    .toBuffer();
                // Get final dimensions
                const jpegMeta = await sharp(jpegBuffer).metadata();
                const pageProcessingTime = Date.now() - pageStartTime;
                console.log(`[PDF Processor] Page ${pageNumber} processed`, {
                    correlationId,
                    sessionId,
                    pageNumber,
                    outputWidth: jpegMeta.width,
                    outputHeight: jpegMeta.height,
                    outputSizeBytes: jpegBuffer.length,
                    processingTimeMs: pageProcessingTime,
                });
                // Store successfully processed page
                pages.push({
                    pageNumber,
                    base64: jpegBuffer.toString('base64'),
                    mime: 'image/jpeg',
                    width: jpegMeta.width || 0,
                    height: jpegMeta.height || 0,
                    originalFormat: 'application/pdf',
                });
            }
            catch (pageError) {
                // Page processing failed - add error page
                console.error(`[PDF Processor] Page ${pageNumber} failed`, {
                    correlationId,
                    sessionId,
                    pageNumber,
                    error: pageError instanceof Error ? pageError.message : String(pageError),
                });
                pages.push({
                    pageNumber,
                    base64: null,
                    mime: 'image/jpeg',
                    width: 0,
                    height: 0,
                    originalFormat: 'application/pdf',
                    error: {
                        message: pageError instanceof Error ? pageError.message : String(pageError),
                        code: 'PAGE_PROCESSING_FAILED',
                        details: pageError,
                    },
                });
                pageErrors.push({
                    pageNumber,
                    error: pageError instanceof Error ? pageError.message : String(pageError),
                });
            }
        }
        // Check if ALL pages failed
        const successfulPages = pages.filter(p => p.base64).length;
        if (successfulPages === 0) {
            throw new Error(`All ${pageFiles.length} pages failed to process. ` +
                `First error: ${pageErrors[0]?.error || 'Unknown'}`);
        }
        // Log partial success if some pages failed
        if (pageErrors.length > 0) {
            console.warn(`[PDF Processor] Partial success: ${successfulPages}/${pageFiles.length} pages processed`, {
                correlationId,
                sessionId,
                successfulPages,
                failedPages: pageErrors.length,
                failedPageNumbers: pageErrors.map(e => e.pageNumber).join(', '),
            });
        }
        const totalTime = Date.now() - startTime;
        console.log(`[PDF Processor] Extraction complete`, {
            correlationId,
            sessionId,
            totalPages: pages.length,
            totalProcessingTimeMs: totalTime,
            averageTimePerPageMs: Math.round(totalTime / pages.length),
        });
        return pages;
    }
    catch (error) {
        console.error(`[PDF Processor] Extraction failed`, {
            correlationId,
            sessionId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });
        throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    finally {
        // Step 5: Clean up temp files
        try {
            console.log(`[PDF Processor] Cleaning up temp files`, {
                correlationId,
                sessionId,
                fileCount: tempImagePaths.length + (tempPdfPath ? 1 : 0),
            });
            // Delete temp PDF
            if (tempPdfPath) {
                await fs_1.promises.unlink(tempPdfPath).catch(() => {
                    // Ignore errors (file might not exist)
                });
            }
            // Delete temp images
            for (const imagePath of tempImagePaths) {
                await fs_1.promises.unlink(imagePath).catch(() => {
                    // Ignore errors
                });
            }
            // Remove temp directory
            await fs_1.promises.rmdir(tempDir).catch(() => {
                // Ignore errors (directory might not be empty)
            });
            console.log(`[PDF Processor] Cleanup complete`, {
                correlationId,
                sessionId,
            });
        }
        catch (cleanupError) {
            console.warn(`[PDF Processor] Cleanup warning`, {
                correlationId,
                sessionId,
                error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            });
            // Don't throw on cleanup errors
        }
    }
}
//# sourceMappingURL=pdf-processor.js.map