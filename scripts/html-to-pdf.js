/**
 * Convert HTML to PDF using Puppeteer
 * Usage: node html-to-pdf.js <input.html> <output.pdf>
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

async function convertHTMLToPDF(htmlFilePath, pdfFilePath) {
  try {
    // Read HTML file
    const html = fs.readFileSync(htmlFilePath, 'utf-8');

    // Launch browser
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set content and wait for any resources to load
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });

    // Generate PDF with medical document formatting
    await page.pdf({
      path: pdfFilePath,
      format: 'A4',
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      },
      printBackground: true,
      preferCSSPageSize: true
    });

    await browser.close();

    return true;
  } catch (error) {
    console.error(`Error converting ${htmlFilePath} to PDF:`, error.message);
    return false;
  }
}

// Main execution
if (process.argv.length < 4) {
  console.error('Usage: node html-to-pdf.js <input.html> <output.pdf>');
  process.exit(1);
}

const htmlFile = process.argv[2];
const pdfFile = process.argv[3];

convertHTMLToPDF(htmlFile, pdfFile)
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
