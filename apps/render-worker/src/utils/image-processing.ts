/**
 * Image Processing Utilities - Phase 2: Format-Preserving Downscaling
 * Created: 2025-10-06, Enhanced: 2025-10-10
 * Purpose: Optimize images before OCR while preserving format and quality
 */

import sharp from 'sharp';

/**
 * Phase 2: Format-preserving downscaling with comprehensive format support
 * 
 * @param b64 - Base64 encoded image data
 * @param mime - MIME type of the image
 * @param maxWidth - Maximum width in pixels (default: 1600)
 * @param quality - Quality for lossy formats (default: 78)
 * @returns Processed image with dimensions and output MIME type
 */
export async function downscaleImageBase64(
  b64: string, 
  mime: string, 
  maxWidth = 1600, 
  quality = 78
): Promise<{ b64: string; width: number; height: number; outMime: string }> {
  // PDF handling - skip downscaling, let OCR handle directly
  if (mime === 'application/pdf') {
    console.log('[ImageProcessing] PDF detected - skipping downscaling (OCR handles directly)');
    return { b64, width: 0, height: 0, outMime: mime };
  }

  // DICOM not supported for OCR
  if (mime === 'application/dicom') {
    throw new Error('DICOM files not supported for OCR processing');
  }

  // HEIC: Not supported by Google Cloud Vision (Phase 3+ will add conversion)
  if (mime === 'image/heic' || mime === 'image/heif') {
    throw new Error('HEIC/HEIF files not yet supported. Format conversion planned for Phase 3 (post-Phase 2). Timeline: 2-3 weeks after Phase 2 completion.');
  }
  
  // Office documents: Future text extraction support
  if (mime.startsWith('application/vnd.openxmlformats') || 
      mime === 'application/msword' || 
      mime === 'application/vnd.ms-excel') {
    throw new Error('Office document processing planned for Phase 4. Timeline: 4-6 weeks after Phase 2 completion.');
  }
  
  // Archive formats: Future bulk processing support
  if (mime === 'application/zip' || mime === 'application/x-rar-compressed') {
    throw new Error('Archive processing planned for Phase 5. Timeline: 8-10 weeks after Phase 2 completion.');
  }

  const buf = Buffer.from(b64, 'base64');
  const img = sharp(buf, { failOn: 'none' }).rotate(); // Respect EXIF
  const meta = await img.metadata();

  // Guard against missing dimensions
  if (!meta.width || !meta.height) {
    console.warn(`[ImageProcessing] Missing dimensions for ${mime}, skipping downscaling`);
    return { b64, width: 0, height: 0, outMime: mime };
  }

  // GUARDRAIL: Skip if not larger than target
  if (meta.width <= maxWidth) {
    console.log(`[ImageProcessing] Image ${meta.width}px <= ${maxWidth}px target, skipping downscaling`);
    return { b64, width: meta.width, height: meta.height, outMime: mime };
  }
  
  // GUARDRAIL: Skip multi-page formats (let OCR handle natively)
  if (mime === 'image/tiff' || mime === 'application/pdf') {
    console.log(`[ImageProcessing] Multi-page format ${mime}, skipping downscaling (OCR handles natively)`);
    return { b64, width: meta.width, height: meta.height, outMime: mime };
  }

  // Format-specific processing
  try {
    if (mime === 'image/jpeg') {
      const out = await img.resize({ width: maxWidth, withoutEnlargement: true, kernel: 'lanczos3' })
        .jpeg({ quality, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toBuffer();
      const outMeta = await sharp(out).metadata();
      return { b64: out.toString('base64'), width: outMeta.width || 0, height: outMeta.height || 0, outMime: 'image/jpeg' };
    }

    if (mime === 'image/png') {
      const out = await img.resize({ width: maxWidth, withoutEnlargement: true, kernel: 'lanczos3' })
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();
      const outMeta = await sharp(out).metadata();
      return { b64: out.toString('base64'), width: outMeta.width || 0, height: outMeta.height || 0, outMime: 'image/png' };
    }

    // WebP support (lossless for medical documents)
    if (mime === 'image/webp') {
      const out = await img.resize({ width: maxWidth, withoutEnlargement: true, kernel: 'lanczos3' })
        .webp({ lossless: true })
        .toBuffer();
      const outMeta = await sharp(out).metadata();
      return { b64: out.toString('base64'), width: outMeta.width || 0, height: outMeta.height || 0, outMime: 'image/webp' };
    }

    // NOTE: Multi-page TIFF handling moved to earlier guardrail check

    // Unknown format: skip processing
    console.warn(`[ImageProcessing] Unknown format ${mime}, skipping downscaling`);
    return { b64, width: meta.width, height: meta.height, outMime: mime };

  } catch (error) {
    console.error(`[ImageProcessing] Error processing ${mime}:`, error);
    // Fallback to original
    return { b64, width: meta.width || 0, height: meta.height || 0, outMime: mime };
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use downscaleImageBase64 for Phase 2+ implementations
 */
export async function downscaleImage(
  base64Data: string,
  maxWidth: number = 1600,
  quality: number = 75
): Promise<string> {
  console.warn('[ImageProcessing] Using legacy downscaleImage - consider upgrading to downscaleImageBase64');
  const result = await downscaleImageBase64(base64Data, 'image/jpeg', maxWidth, quality);
  return result.b64;
}

/**
 * Estimate token reduction from image optimization
 *
 * @param originalSize - Original file size in bytes
 * @param optimizedSize - Optimized file size in bytes
 * @returns Estimated token reduction percentage
 */
export function estimateTokenReduction(originalSize: number, optimizedSize: number): number {
  // Rough approximation: token count is proportional to file size
  return ((1 - optimizedSize / originalSize) * 100);
}