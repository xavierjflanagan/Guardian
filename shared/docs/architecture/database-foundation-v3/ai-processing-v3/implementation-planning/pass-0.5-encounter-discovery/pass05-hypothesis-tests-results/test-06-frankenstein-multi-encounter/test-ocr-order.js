/**
 * OCR Reading Order Test
 * Extracts Google Cloud Vision text to verify multi-column reading hypothesis
 */

const fs = require('fs');
const path = require('path');

async function testOCROrder() {
  // Read the PDF (absolute path)
  const pdfPath = '/Users/xflanagan/Documents/GitHub/Guardian-Cursor/sample-medical-records/patient-006-emma-thompson/pdfs/006_Emma_Thompson_Frankenstein_Progress_note_Emergency_summary.pdf';
  const pdfBuffer = fs.readFileSync(pdfPath);
  const base64 = pdfBuffer.toString('base64');

  // Call Google Cloud Vision
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_CLOUD_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64 },
          features: [{
            type: 'DOCUMENT_TEXT_DETECTION',
            maxResults: 1
          }],
          imageContext: {
            languageHints: ['en']
          }
        }]
      })
    }
  );

  const result = await response.json();

  if (!result.responses || !result.responses[0]) {
    console.error('Error:', JSON.stringify(result, null, 2));
    return;
  }

  const ocrOutput = result.responses[0];
  const fullText = ocrOutput.fullTextAnnotation?.text || '';

  // Save full OCR text
  const outputPath = path.join(__dirname, 'ocr-full-text.txt');
  fs.writeFileSync(outputPath, fullText, 'utf-8');
  console.log(`Full OCR text saved to: ${outputPath}`);
  console.log(`Total length: ${fullText.length} characters`);

  // Find key markers
  const findPositions = (text, searchTerm) => {
    const positions = [];
    let index = text.indexOf(searchTerm, 0);
    while (index !== -1) {
      positions.push(index);
      index = text.indexOf(searchTerm, index + 1);
    }
    return positions;
  };

  const davidPositions = findPositions(fullText, 'David');
  const neckmanPositions = findPositions(fullText, 'Neckman');
  const matthewPositions = findPositions(fullText, 'Matthew');
  const tinkhamPositions = findPositions(fullText, 'Tinkham');
  const emergencySummaryPositions = findPositions(fullText, 'Encounter Summary');
  const progressNotePositions = findPositions(fullText, 'Progress note');

  console.log('\n=== KEY MARKER POSITIONS IN OCR TEXT ===');
  console.log(`"Progress note" at: ${progressNotePositions.join(', ')}`);
  console.log(`"Encounter Summary" at: ${emergencySummaryPositions.join(', ')}`);
  console.log(`"David" at: ${davidPositions.slice(0, 5).join(', ')}... (showing first 5 of ${davidPositions.length})`);
  console.log(`"Neckman" at: ${neckmanPositions.join(', ')}`);
  console.log(`"Matthew" at: ${matthewPositions.slice(0, 5).join(', ')}... (showing first 5 of ${matthewPositions.length})`);
  console.log(`"Tinkham" at: ${tinkhamPositions.join(', ')}`);

  // Check if David Neckman appears AFTER Encounter Summary
  if (emergencySummaryPositions.length > 0) {
    const emergencyPos = emergencySummaryPositions[0];
    const davidAfter = davidPositions.filter(pos => pos > emergencyPos);
    const neckmanAfter = neckmanPositions.filter(pos => pos > emergencyPos);

    console.log(`\n=== CRITICAL ANALYSIS ===`);
    console.log(`First "Encounter Summary" at position: ${emergencyPos}`);
    console.log(`"David" appearances AFTER Encounter Summary: ${davidAfter.length}`);
    console.log(`"Neckman" appearances AFTER Encounter Summary: ${neckmanAfter.length}`);

    if (neckmanAfter.length > 0) {
      console.log('\n⚠️  HYPOTHESIS CONFIRMED!');
      console.log(`"Neckman" appears AFTER "Encounter Summary" in OCR text`);
      console.log(`This explains why GPT-5 thought David Neckman was on page 14+`);

      // Show context around first problematic occurrence
      const problemPos = neckmanAfter[0];
      const contextStart = Math.max(0, problemPos - 300);
      const contextEnd = Math.min(fullText.length, problemPos + 300);
      console.log('\n=== CONTEXT AROUND "NECKMAN" AFTER EMERGENCY ===');
      console.log(fullText.substring(contextStart, contextEnd));
    } else {
      console.log('\n✅ "Neckman" only appears BEFORE "Encounter Summary"');
    }
  }

  // Save page-by-page breakdown if available
  if (ocrOutput.fullTextAnnotation?.pages) {
    const pageBreakdown = ocrOutput.fullTextAnnotation.pages.map((page, idx) => {
      const pageText = page.blocks?.map(block =>
        block.paragraphs?.map(para =>
          para.words?.map(word =>
            word.symbols?.map(sym => sym.text).join('')
          ).join(' ')
        ).join('\n')
      ).join('\n\n') || '';

      return `\n=== PAGE ${idx + 1} ===\n${pageText}`;
    }).join('\n\n');

    const pageOutputPath = path.join(__dirname, 'ocr-page-breakdown.txt');
    fs.writeFileSync(pageOutputPath, pageBreakdown, 'utf-8');
    console.log(`\nPage-by-page breakdown saved to: ${pageOutputPath}`);
  }
}

testOCROrder().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
