/**
 * OCR Reading Order Analysis
 *
 * PURPOSE: Extract the actual OCR text sent to GPT-5 to verify if multi-column
 * reading order is causing David Neckman's name to appear after page 14 content
 *
 * HYPOTHESIS: Google Cloud Vision reads pages column-by-column (left then right),
 * causing metadata from right columns (pages 1-13) to appear after page 14 text,
 * making GPT-5 think David Neckman is on page 14
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import * as fs from 'fs/promises';
import * as path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GOOGLE_CLOUD_API_KEY = process.env.GOOGLE_CLOUD_API_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function extractOCRReadingOrder() {
  const shellFileId = 'ed153ebb-9ce2-4307-84d0-5c76a0148652';

  // 1. Download the PDF from Supabase Storage
  const { data: fileData } = await supabase.storage
    .from('medical-documents')
    .download(`${shellFileId}/original.pdf`);

  if (!fileData) {
    throw new Error('Failed to download PDF');
  }

  // 2. Convert to base64
  const buffer = await fileData.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  // 3. Call Google Cloud Vision OCR
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_CLOUD_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
        }]
      })
    }
  );

  const result = await response.json();
  const ocrOutput = result.responses[0];

  // 4. Extract the full text (this is what GPT-5 sees)
  const fullText = ocrOutput.fullTextAnnotation.text;

  // 5. Save to file for analysis
  const outputPath = path.join(__dirname, 'ocr-reading-order-output.txt');
  await fs.writeFile(outputPath, fullText, 'utf-8');

  console.log(`OCR text saved to: ${outputPath}`);
  console.log(`Total length: ${fullText.length} characters`);

  // 6. Find where "David Neckman" appears in the OCR text
  const davidNeckmanMatches: number[] = [];
  let index = fullText.indexOf('David Neckman', 0);
  while (index !== -1) {
    davidNeckmanMatches.push(index);
    index = fullText.indexOf('David Neckman', index + 1);
  }

  // 7. Find where "Matthew Tinkham" appears
  const matthewTinkhamMatches: number[] = [];
  index = fullText.indexOf('Matthew T Tinkham', 0);
  while (index !== -1) {
    matthewTinkhamMatches.push(index);
    index = fullText.indexOf('Matthew T Tinkham', index + 1);
  }

  // 8. Find where "Emergency" encounter header appears
  const emergencyMatches: number[] = [];
  index = fullText.indexOf('Encounter Summary', 0);
  while (index !== -1) {
    emergencyMatches.push(index);
    index = fullText.indexOf('Encounter Summary', index + 1);
  }

  console.log('\n=== NAME POSITIONS IN OCR TEXT ===');
  console.log(`David Neckman found at character positions: ${davidNeckmanMatches.join(', ')}`);
  console.log(`Matthew T Tinkham found at character positions: ${matthewTinkhamMatches.join(', ')}`);
  console.log(`"Encounter Summary" found at character positions: ${emergencyMatches.join(', ')}`);

  // 9. Determine if David Neckman appears AFTER Emergency header
  if (emergencyMatches.length > 0 && davidNeckmanMatches.length > 0) {
    const emergencyPosition = emergencyMatches[0];
    const davidAfterEmergency = davidNeckmanMatches.filter(pos => pos > emergencyPosition);

    if (davidAfterEmergency.length > 0) {
      console.log('\n⚠️  HYPOTHESIS CONFIRMED!');
      console.log(`David Neckman appears AFTER "Encounter Summary" in OCR text`);
      console.log(`Emergency header at: ${emergencyPosition}`);
      console.log(`David Neckman appearances after emergency: ${davidAfterEmergency.join(', ')}`);

      // Show context around the problematic occurrence
      const problemPos = davidAfterEmergency[0];
      const contextStart = Math.max(0, problemPos - 200);
      const contextEnd = Math.min(fullText.length, problemPos + 200);
      console.log('\n=== CONTEXT AROUND DAVID NECKMAN AFTER EMERGENCY ===');
      console.log(fullText.substring(contextStart, contextEnd));
    } else {
      console.log('\n✅ David Neckman only appears BEFORE Emergency header');
    }
  }
}

extractOCRReadingOrder().catch(console.error);
