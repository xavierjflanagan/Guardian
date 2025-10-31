# XML to PDF Conversion Guide
**Complete Step-by-Step Process for Converting HL7 CDA XML Medical Records to PDF**

Date: October 31, 2025
Status: Fully Operational
Method: Official HL7 CDA Stylesheet (Industry Standard)

---

## Overview

This guide documents the complete process for converting HL7 CDA (Clinical Document Architecture) XML medical records into professional, properly formatted PDF documents using the official HL7 stylesheet - the same approach used by Epic, Cerner, and all major EHR systems worldwide.

## Why This Approach Works

**Previous Failed Attempts:**
- Custom XML parsing with libraries like `xml2js` couldn't handle complex CDA structure
- Manual rendering logic resulted in `[object Object]` errors and raw XML display
- Building custom rendering from scratch is error-prone and misses edge cases

**Official HL7 Stylesheet Solution:**
- Maintained by HL7 Structured Documents Workgroup
- Tested against thousands of real-world CDA documents
- Handles all CDA variations (C-CDA R2, CDA R2, etc.)
- Supports complex nested structures, tables, and narrative blocks
- Industry-standard rendering used by healthcare providers worldwide

---

## Prerequisites

### Required Software

1. **xsltproc** (XSLT Processor)
   - Built into macOS (no installation needed)
   - Linux: `sudo apt-get install xsltproc`
   - Windows: Download from http://xmlsoft.org/XSLT/xsltproc2.html

2. **Node.js and npm**
   - Download: https://nodejs.org/ (LTS version recommended)
   - Verify installation: `node --version` and `npm --version`

3. **Puppeteer** (Headless Chrome for PDF generation)
   - Install globally: `npm install -g puppeteer`
   - Or install locally in project: `npm install puppeteer`

### Required Files

1. **Official HL7 CDA Stylesheet**
   - Source: https://github.com/HL7/cda-core-xsl
   - Download `CDA.xsl` (v4.1.0-beta.2 or latest)
   - Download helper files:
     - `cda_l10n.xml` (localization data)
     - `cda_narrativeblock.xml` (narrative block security rules)
   - Save all files to `/tmp/` directory

2. **Your XML Medical Records**
   - Must be valid HL7 CDA format
   - Can be C-CDA (Consolidated CDA) or CDA R2

---

## Step-by-Step Process

### Step 1: Download Official HL7 Stylesheet

```bash
# Create tmp directory if it doesn't exist
mkdir -p /tmp

# Download main stylesheet
curl -o /tmp/CDA.xsl https://raw.githubusercontent.com/HL7/cda-core-xsl/master/CDA.xsl

# Download helper files
curl -o /tmp/cda_l10n.xml https://raw.githubusercontent.com/HL7/cda-core-xsl/master/cda_l10n.xml
curl -o /tmp/cda_narrativeblock.xml https://raw.githubusercontent.com/HL7/cda-core-xsl/master/cda_narrativeblock.xml
```

**File Sizes (for verification):**
- CDA.xsl: ~365KB
- cda_l10n.xml: ~559KB
- cda_narrativeblock.xml: ~2.9KB

### Step 2: Create HTML-to-PDF Converter Script

Create `html-to-pdf.js`:

```javascript
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
```

### Step 3: Create Automation Script (Optional)

Create `generate-pdfs.sh` to process multiple files:

```bash
#!/bin/bash

# Configuration
XML_DIR="path/to/your/xml/files"
OUTPUT_DIR="path/to/output/pdfs"
TMP_DIR="/tmp/cda-conversion"

# Create directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$TMP_DIR"

# Process each XML file
for xml_file in "$XML_DIR"/*.xml; do
    if [ ! -f "$xml_file" ]; then
        continue
    fi

    echo "Processing: $(basename "$xml_file")"

    # Generate base filename
    base_name="$(basename "${xml_file%.xml}")"
    html_file="$TMP_DIR/${base_name}.html"
    pdf_file="$OUTPUT_DIR/${base_name}.pdf"

    # Step 1: XML → HTML using xsltproc
    xsltproc /tmp/CDA.xsl "$xml_file" > "$html_file"

    # Step 2: HTML → PDF using Puppeteer
    node html-to-pdf.js "$html_file" "$pdf_file"

    echo "Generated: ${base_name}.pdf"
done

echo "PDF generation complete!"
```

### Step 4: Convert Single XML File (Manual)

```bash
# Set your file paths
XML_FILE="Continuity of Care Document.xml"
HTML_FILE="/tmp/output.html"
PDF_FILE="Continuity of Care Document.pdf"

# Step 1: Transform XML to HTML
xsltproc /tmp/CDA.xsl "$XML_FILE" > "$HTML_FILE"

# Step 2: Convert HTML to PDF
node html-to-pdf.js "$HTML_FILE" "$PDF_FILE"
```

### Step 5: Verify Output

Check the generated PDF:
- Should display proper medical document formatting
- Patient demographics in header section
- Clinical sections with standardized styling
- Tables properly formatted
- All content readable and printable

---

## Troubleshooting

### XSLT Transformation Fails

**Problem:** `xsltproc` returns errors

**Solutions:**
1. Verify XML is valid HL7 CDA format
2. Check that CDA.xsl and helper files are in /tmp/
3. Ensure helper files (cda_l10n.xml, cda_narrativeblock.xml) are present
4. Try validating XML first: `xmllint --noout your-file.xml`

### PDF Generation Fails

**Problem:** Puppeteer fails to generate PDF

**Solutions:**
1. Verify Puppeteer is installed: `npm list puppeteer`
2. Check Node.js version is compatible (v14+ recommended)
3. Try running Puppeteer in non-headless mode for debugging:
   ```javascript
   const browser = await puppeteer.launch({ headless: false });
   ```
4. Check Chrome/Chromium is properly installed

### Empty or Malformed PDFs

**Problem:** PDF generates but content is missing

**Solutions:**
1. Verify HTML file was created properly (check size > 0)
2. Open HTML file in browser to verify rendering
3. Check console for JavaScript errors
4. Increase Puppeteer wait time: `waitUntil: 'networkidle0'`

### Permission Errors

**Problem:** Cannot write to output directories

**Solutions:**
1. Check directory permissions: `ls -la /tmp/`
2. Create output directory first: `mkdir -p output-dir`
3. Run with appropriate permissions

---

## Output Format

### PDF Structure

Each generated PDF includes:

1. **Header Section**
   - Document title and type
   - Document ID and version
   - Creation date and time
   - Author information

2. **Patient Demographics Box** (highlighted)
   - Patient name
   - Date of birth
   - Gender and marital status
   - Contact information

3. **Clinical Sections** (color-coded)
   - Allergies and Adverse Reactions
   - Medications
   - Problems and Diagnoses
   - Procedures
   - Vital Signs
   - Lab Results
   - etc.

4. **Footer**
   - Page numbers
   - Document metadata

### Styling Features

- Professional healthcare document appearance
- Color-coded section headers
- Consistent typography
- Proper table formatting
- Print-optimized layout
- Accessible text sizing

---

## File Sizes and Performance

**Typical Conversion Times (per document):**
- XML → HTML: <1 second
- HTML → PDF: 2-4 seconds
- Total: 3-5 seconds per document

**Expected Output Sizes:**
- Continuity of Care Document: 250-350KB
- Office Visit Summary: 200-300KB
- Hospital Encounter Summary: 150-200KB
- Travel/Transfer Summary: 150-200KB

---

## Use Cases

These PDFs can be used for:

1. Patient portals and health record access
2. Document sharing between healthcare providers
3. Print copies for patients
4. Medical record archiving
5. Demo and testing purposes
6. OCR accuracy validation
7. Healthcare application testing

---

## Technical Details

### XSLT Processing

**How it works:**
1. `xsltproc` reads the XML document
2. Applies transformation rules from CDA.xsl
3. Uses helper files for localization and security
4. Outputs properly formatted HTML with embedded CSS

**Key Features:**
- Handles all CDA document types
- Supports multiple languages (via cda_l10n.xml)
- Security-aware (validates narrative blocks)
- Extensible for custom styling

### PDF Generation

**Puppeteer Configuration:**
- Headless Chrome/Chromium engine
- A4 page format (210mm × 297mm)
- 20mm margins on all sides
- Print backgrounds enabled
- CSS page size respected

**Why Puppeteer:**
- Accurate HTML/CSS rendering
- Consistent output across platforms
- Supports complex layouts and tables
- Handles embedded styles properly

---

## Additional Resources

**Official HL7 Resources:**
- CDA Stylesheet GitHub: https://github.com/HL7/cda-core-xsl
- HL7 CDA Standard: http://www.hl7.org/implement/standards/product_brief.cfm?product_id=7
- C-CDA Implementation Guide: http://www.hl7.org/implement/standards/product_brief.cfm?product_id=492

**Tools:**
- xsltproc Documentation: http://xmlsoft.org/XSLT/xsltproc.html
- Puppeteer Documentation: https://pptr.dev/
- Node.js: https://nodejs.org/

**Validation:**
- XML Validation: https://www.xmlvalidation.com/
- CDA Validation: https://hl7v2-cda-validator.lantanagroup.com/

---

## Scripts in This Repository

**Location:** `scripts/`

1. **deidentify-xml-properly.sh**
   - Comprehensive de-identification of HL7 CDA XML files
   - Replaces patient names, provider names, addresses, phone numbers
   - Systematic sed-based find-replace approach
   - Verification step included

2. **generate-pdfs-official.sh**
   - Main automation script for XML→PDF conversion
   - Uses official HL7 CDA stylesheet
   - Processes multiple files in batch
   - Two-step process: XML→HTML→PDF

3. **html-to-pdf.js**
   - Puppeteer-based HTML to PDF converter
   - Medical document formatting
   - A4 page layout with proper margins

**Usage:**
```bash
# De-identify XML files
./scripts/deidentify-xml-properly.sh

# Generate PDFs
./scripts/generate-pdfs-official.sh
```

---

## Summary

**Two-Step Conversion Process:**
1. XML → HTML using xsltproc + official HL7 CDA stylesheet
2. HTML → PDF using Puppeteer

**Key Success Factors:**
- Using official HL7 stylesheet (not custom parsing)
- Proper XSLT transformation with all helper files
- Puppeteer for accurate HTML/CSS rendering
- Appropriate page formatting and margins

**Output:**
- Professional medical document PDFs
- Industry-standard formatting
- Printable and shareable
- Consistent with EHR system outputs

---

**Last Updated:** October 31, 2025
**Version:** 1.0
**Maintained By:** Xavier Flanagan / Exora Health
