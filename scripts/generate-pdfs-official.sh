#!/bin/bash

# Generate PDFs from de-identified XML using official HL7 CDA stylesheet
# Step 1: XML → HTML (using xsltproc + official CDA.xsl)
# Step 2: HTML → PDF (using Puppeteer)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
XML_DIR="$PROJECT_ROOT/XML medical records files for de-identification/de-identified-final"
OUTPUT_DIR="$PROJECT_ROOT/XML medical records files for de-identification/PDFs"
TMP_DIR="/tmp/cda-conversion"

# Create directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$TMP_DIR"

echo "🔄 Converting de-identified XML files to PDF using official HL7 CDA stylesheet..."
echo ""

# XML files to process
declare -a XML_FILES=(
    "Continuity of Care Document.xml"
    "External Hospital Encounter Summary.xml"
    "Office Visit Summary.xml"
    "Travel Summary.xml"
)

# Process each XML file
for xml_file in "${XML_FILES[@]}"; do
    if [ ! -f "$XML_DIR/$xml_file" ]; then
        echo "⚠️  File not found: $xml_file"
        continue
    fi

    echo "📄 Processing: $xml_file"

    # Generate base filename (without extension)
    base_name="${xml_file%.xml}"
    html_file="$TMP_DIR/${base_name}.html"
    pdf_file="$OUTPUT_DIR/${base_name}.pdf"

    # Step 1: Transform XML to HTML using official CDA stylesheet
    echo "   → Transforming XML to HTML..."
    if ! xsltproc /tmp/CDA.xsl "$XML_DIR/$xml_file" > "$html_file" 2>&1; then
        echo "   ✗ XSLT transformation failed"
        continue
    fi

    # Step 2: Convert HTML to PDF using Puppeteer
    echo "   → Converting HTML to PDF..."
    if ! node "$SCRIPT_DIR/html-to-pdf.js" "$html_file" "$pdf_file"; then
        echo "   ✗ PDF conversion failed"
        continue
    fi

    echo "   ✓ Generated: ${base_name}.pdf"
    echo ""
done

echo ""
echo "✅ PDF generation complete!"
echo "📁 Output directory: $OUTPUT_DIR"
echo ""

ls -lh "$OUTPUT_DIR"/*.pdf 2>/dev/null | awk '{print "   " $9 " (" $5 ")"}'
