#!/bin/bash

# Generate PDFs from de-identified XML using official HL7 CDA stylesheet
# Step 1: XML → HTML (using xsltproc + official CDA.xsl)
# Step 2: HTML → PDF (using Puppeteer)
#
# Usage: ./generate-pdfs-official.sh <patient-id> <patient-name>
# Example: ./generate-pdfs-official.sh 001 "Xavier Flanagan"

set -e

# Check arguments
if [ $# -lt 2 ]; then
    echo "Usage: $0 <patient-id> <patient-name>"
    echo "Example: $0 001 \"Xavier Flanagan\""
    exit 1
fi

PATIENT_ID="$1"
PATIENT_NAME="$2"
# Replace spaces with underscores for filename
PATIENT_NAME_FILE="${PATIENT_NAME// /_}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Detect patient folder (support both naming conventions)
PATIENT_FOLDER=""
for folder in "$PROJECT_ROOT"/patient-${PATIENT_ID}-*; do
    if [ -d "$folder" ]; then
        PATIENT_FOLDER="$folder"
        break
    fi
done

if [ -z "$PATIENT_FOLDER" ]; then
    echo "❌ Error: Patient folder not found for ID: $PATIENT_ID"
    echo "Expected: $PROJECT_ROOT/patient-${PATIENT_ID}-*"
    exit 1
fi

XML_DIR="$PATIENT_FOLDER/de-identified-xml"
OUTPUT_DIR="$PATIENT_FOLDER/pdfs"
TMP_DIR="/tmp/cda-conversion"

# Verify directories exist
if [ ! -d "$XML_DIR" ]; then
    echo "❌ Error: XML directory not found: $XML_DIR"
    exit 1
fi

# Create directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$TMP_DIR"

echo "🔄 Converting de-identified XML files to PDF using official HL7 CDA stylesheet..."
echo "📋 Patient ID: $PATIENT_ID"
echo "👤 Patient Name: $PATIENT_NAME"
echo "📁 Source: $XML_DIR"
echo "📁 Output: $OUTPUT_DIR"
echo ""

# Process all XML files in the de-identified-xml directory
for xml_file in "$XML_DIR"/*.xml; do
    if [ ! -f "$xml_file" ]; then
        echo "⚠️  No XML files found in: $XML_DIR"
        continue
    fi

    filename=$(basename "$xml_file")
    echo "📄 Processing: $filename"

    # Generate base filename (without extension)
    base_name="${filename%.xml}"
    # Replace spaces with underscores
    base_name_clean="${base_name// /_}"

    html_file="$TMP_DIR/${base_name}.html"
    pdf_file="$OUTPUT_DIR/${PATIENT_ID}_${PATIENT_NAME_FILE}_${base_name_clean}.pdf"

    # Step 1: Transform XML to HTML using official CDA stylesheet
    echo "   → Transforming XML to HTML..."
    if ! xsltproc /tmp/CDA.xsl "$xml_file" > "$html_file" 2>&1; then
        echo "   ✗ XSLT transformation failed"
        continue
    fi

    # Step 2: Convert HTML to PDF using Puppeteer
    echo "   → Converting HTML to PDF..."
    if ! node "$SCRIPT_DIR/html-to-pdf.js" "$html_file" "$pdf_file"; then
        echo "   ✗ PDF conversion failed"
        continue
    fi

    pdf_filename=$(basename "$pdf_file")
    echo "   ✓ Generated: $pdf_filename"
    echo ""
done

echo ""
echo "✅ PDF generation complete!"
echo "📁 Output directory: $OUTPUT_DIR"
echo ""

ls -lh "$OUTPUT_DIR"/*.pdf 2>/dev/null | awk '{print "   " $9 " (" $5 ")"}'
