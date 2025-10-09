/**
 * Checksum utility for file integrity verification
 * Used in OCR transition to verify file integrity after download
 */

import crypto from 'crypto';

export async function calculateSHA256(data: Blob | Buffer | ArrayBuffer): Promise<string> {
  let buffer: Buffer;
  
  if (data instanceof Buffer) {
    buffer = data;
  } else if (data instanceof ArrayBuffer) {
    buffer = Buffer.from(data);
  } else {
    // Blob - check if it has arrayBuffer method
    if ('arrayBuffer' in data && typeof data.arrayBuffer === 'function') {
      buffer = Buffer.from(await data.arrayBuffer());
    } else {
      throw new Error('Unsupported data type for checksum calculation');
    }
  }

  return crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');
}