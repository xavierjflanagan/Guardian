/**
 * Generate PDFs from de-identified XML medical records
 * Parses HL7 CDA XML and renders as professional medical document PDFs
 */

const fs = require('fs').promises;
const path = require('path');
const puppeteer = require('puppeteer');
const xml2js = require('xml2js');

const INPUT_DIR = path.join(__dirname, '..', 'XML medical records files for de-identification', 'de-identified version');
const OUTPUT_DIR = path.join(__dirname, '..', 'XML medical records files for de-identification', 'PDFs');

function formatDate(cdaDate) {
  if (!cdaDate) return 'Not specified';

  // CDA dates are in format: YYYYMMDD or YYYYMMDDHHMMSS
  const dateStr = String(cdaDate);
  if (dateStr.length >= 8) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${day}/${month}/${year}`;
  }
  return cdaDate;
}

function extractText(obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(extractText).filter(Boolean).join(' ');
  if (typeof obj === 'object') {
    if (obj._) return obj._;
    if (obj.$t) return obj.$t;
    return '';
  }
  return '';
}

function extractName(nameObj) {
  if (!nameObj) return 'Unknown';

  let name = nameObj;
  if (Array.isArray(nameObj)) {
    name = nameObj[0];
  }

  const given = name.given ? (Array.isArray(name.given) ? name.given.join(' ') : name.given) : '';
  const family = name.family || '';

  return `${given} ${family}`.trim() || 'Unknown';
}

function extractAddress(addrObj) {
  if (!addrObj) return '';

  let addr = addrObj;
  if (Array.isArray(addrObj)) {
    addr = addrObj[0];
  }

  const parts = [];
  if (addr.streetAddressLine) {
    const street = Array.isArray(addr.streetAddressLine)
      ? addr.streetAddressLine.join(', ')
      : addr.streetAddressLine;
    parts.push(street);
  }
  if (addr.city) parts.push(addr.city);
  if (addr.state) parts.push(addr.state);
  if (addr.postalCode) parts.push(addr.postalCode);

  return parts.join(', ');
}

function renderSection(section) {
  if (!section) return '';

  const title = section.title || 'Section';
  let content = '';

  // Extract text content
  if (section.text) {
    if (typeof section.text === 'string') {
      content = section.text;
    } else if (section.text.table) {
      // Handle tables
      content = renderTable(section.text.table);
    } else if (section.text.list) {
      // Handle lists
      content = renderList(section.text.list);
    } else if (section.text.paragraph) {
      // Handle paragraphs
      const paras = Array.isArray(section.text.paragraph)
        ? section.text.paragraph
        : [section.text.paragraph];
      content = paras.map(p => `<p>${extractText(p)}</p>`).join('');
    } else {
      // Fallback: extract all text
      content = `<p>${extractText(section.text)}</p>`;
    }
  }

  return `
    <div class="clinical-section">
      <h3>${title}</h3>
      <div class="section-content">${content}</div>
    </div>
  `;
}

function renderTable(table) {
  if (!table) return '';

  const tables = Array.isArray(table) ? table : [table];

  return tables.map(t => {
    const thead = t.thead;
    const tbody = t.tbody;

    let html = '<table class="clinical-table">';

    // Render header
    if (thead && thead.tr) {
      const headerRows = Array.isArray(thead.tr) ? thead.tr : [thead.tr];
      html += '<thead>';
      headerRows.forEach(row => {
        html += '<tr>';
        const cells = Array.isArray(row.th) ? row.th : [row.th];
        cells.forEach(cell => {
          html += `<th>${extractText(cell)}</th>`;
        });
        html += '</tr>';
      });
      html += '</thead>';
    }

    // Render body
    if (tbody && tbody.tr) {
      const bodyRows = Array.isArray(tbody.tr) ? tbody.tr : [tbody.tr];
      html += '<tbody>';
      bodyRows.forEach(row => {
        html += '<tr>';
        const cells = Array.isArray(row.td) ? row.td : [row.td];
        cells.forEach(cell => {
          html += `<td>${extractText(cell)}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody>';
    }

    html += '</table>';
    return html;
  }).join('');
}

function renderList(list) {
  if (!list) return '';

  const lists = Array.isArray(list) ? list : [list];

  return lists.map(l => {
    const items = Array.isArray(l.item) ? l.item : [l.item];
    return `
      <ul class="clinical-list">
        ${items.map(item => `<li>${extractText(item)}</li>`).join('')}
      </ul>
    `;
  }).join('');
}

async function parseCdaXml(xmlContent) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
    xmlns: true
  });

  return await parser.parseStringPromise(xmlContent);
}

async function transformXmlToHtml(xmlContent) {
  try {
    const parsed = await parseCdaXml(xmlContent);
    const doc = parsed.ClinicalDocument;

    // Extract basic document info
    const title = extractText(doc.title) || 'Clinical Document';
    const documentId = doc.id?.root || 'Unknown';
    const effectiveTime = formatDate(doc.effectiveTime?.value);

    // Extract patient info
    const recordTarget = Array.isArray(doc.recordTarget) ? doc.recordTarget[0] : doc.recordTarget;
    const patientRole = recordTarget?.patientRole;
    const patient = patientRole?.patient;

    const patientName = extractName(patient?.name);
    const birthTime = formatDate(patient?.birthTime?.value);
    const gender = patient?.administrativeGenderCode?.code || 'Unknown';
    const patientAddress = extractAddress(patientRole?.addr);

    // Extract author info
    const author = Array.isArray(doc.author) ? doc.author[0] : doc.author;
    const authorPerson = author?.assignedAuthor?.assignedPerson;
    const authorName = extractName(authorPerson?.name);

    // Extract clinical sections
    let clinicalContent = '';
    if (doc.component?.structuredBody?.component) {
      const components = Array.isArray(doc.component.structuredBody.component)
        ? doc.component.structuredBody.component
        : [doc.component.structuredBody.component];

      clinicalContent = components
        .map(comp => comp.section ? renderSection(comp.section) : '')
        .filter(Boolean)
        .join('');
    }

    // Build HTML
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 40px;
      line-height: 1.6;
      color: #333;
      background-color: white;
    }
    .header {
      border-bottom: 4px solid #2c3e50;
      margin-bottom: 30px;
      padding-bottom: 20px;
    }
    h1 {
      color: #2c3e50;
      margin: 0 0 15px 0;
      font-size: 28px;
      font-weight: 600;
    }
    .document-meta {
      color: #666;
      font-size: 13px;
      line-height: 1.8;
    }
    .patient-info {
      background-color: #f0f7ff;
      padding: 25px;
      border-radius: 8px;
      margin: 25px 0;
      border-left: 5px solid #3498db;
    }
    .patient-info h2 {
      margin-top: 0;
      margin-bottom: 15px;
      color: #2c3e50;
      font-size: 20px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 12px;
    }
    .info-label {
      font-weight: 600;
      color: #2c3e50;
    }
    .clinical-section {
      margin: 30px 0;
      padding: 20px;
      background-color: #fafafa;
      border-radius: 5px;
      border-left: 4px solid #95a5a6;
    }
    .clinical-section h3 {
      margin-top: 0;
      margin-bottom: 15px;
      color: #34495e;
      font-size: 18px;
      border-bottom: 2px solid #ddd;
      padding-bottom: 8px;
    }
    .section-content {
      color: #555;
      font-size: 14px;
    }
    .clinical-table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      background-color: white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .clinical-table th {
      background-color: #3498db;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
    }
    .clinical-table td {
      padding: 10px 12px;
      border: 1px solid #ddd;
      font-size: 13px;
    }
    .clinical-table tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .clinical-list {
      margin: 10px 0;
      padding-left: 25px;
    }
    .clinical-list li {
      margin: 8px 0;
      line-height: 1.6;
    }
    .section-content p {
      margin: 10px 0;
      line-height: 1.7;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #dee2e6;
      font-size: 12px;
      color: #999;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="document-meta">
      <strong>Document ID:</strong> ${documentId}<br>
      <strong>Created:</strong> ${effectiveTime}<br>
      <strong>Author:</strong> ${authorName}
    </div>
  </div>

  <div class="patient-info">
    <h2>Patient Information</h2>
    <div class="info-grid">
      <div class="info-label">Name:</div>
      <div>${patientName}</div>

      <div class="info-label">Date of Birth:</div>
      <div>${birthTime}</div>

      <div class="info-label">Gender:</div>
      <div>${gender}</div>

      ${patientAddress ? `
      <div class="info-label">Address:</div>
      <div>${patientAddress}</div>
      ` : ''}
    </div>
  </div>

  <div class="content">
    ${clinicalContent || '<p style="color: #666; font-style: italic;">No structured clinical content available in this document.</p>'}
  </div>

  <div class="footer">
    Generated from de-identified HL7 CDA XML medical record
  </div>
</body>
</html>
    `;

    return html;

  } catch (error) {
    console.warn('Could not parse XML, using raw display:', error.message);

    // Fallback: display raw XML with syntax highlighting
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Clinical Document</title>
  <style>
    body {
      font-family: 'Courier New', monospace;
      margin: 40px;
      line-height: 1.5;
      font-size: 11px;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  <h1>Clinical Document (Raw XML)</h1>
  <pre>${xmlContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</body>
</html>
    `;
  }
}

async function convertXmlToPdf(xmlFilePath, outputPdfPath) {
  try {
    console.log(`Processing: ${path.basename(xmlFilePath)}`);

    // Read XML file
    const xmlContent = await fs.readFile(xmlFilePath, 'utf-8');

    // Transform XML to HTML (using simple wrapper for now)
    // A full XSLT transformation would require additional libraries
    const html = await transformXmlToHtml(xmlContent);

    // Launch headless browser
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set content and wait for any dynamic content to load
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF with medical document formatting
    await page.pdf({
      path: outputPdfPath,
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

    console.log(`✓ Generated: ${path.basename(outputPdfPath)}`);

  } catch (error) {
    console.error(`Error processing ${xmlFilePath}:`, error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('Starting PDF generation from de-identified XML medical records...\n');

    // Read all XML files from input directory
    const files = await fs.readdir(INPUT_DIR);
    const xmlFiles = files.filter(f => f.endsWith('.xml'));

    if (xmlFiles.length === 0) {
      console.log('No XML files found in input directory');
      return;
    }

    console.log(`Found ${xmlFiles.length} XML files to process\n`);

    // Process each XML file
    for (const xmlFile of xmlFiles) {
      const xmlFilePath = path.join(INPUT_DIR, xmlFile);
      const pdfFileName = xmlFile.replace('.xml', '.pdf');
      const outputPdfPath = path.join(OUTPUT_DIR, pdfFileName);

      await convertXmlToPdf(xmlFilePath, outputPdfPath);
    }

    console.log('\n✓ All PDFs generated successfully!');
    console.log(`Output directory: ${OUTPUT_DIR}`);

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
