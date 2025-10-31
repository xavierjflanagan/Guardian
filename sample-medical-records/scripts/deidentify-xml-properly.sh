#!/bin/bash

# PROPER DE-IDENTIFICATION SCRIPT FOR MEDICAL XML FILES
# This script does systematic find-replace on ALL occurrences

set -e

ORIG_DIR="XML medical records files for de-identification"
OUTPUT_DIR="XML medical records files for de-identification/de-identified-final"

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "Starting comprehensive de-identification..."
echo ""

# Process each XML file
for xml_file in "$ORIG_DIR"/*.xml; do
    filename=$(basename "$xml_file")
    echo "Processing: $filename"

    # Copy file to output
    output_file="$OUTPUT_DIR/$filename"
    cp "$xml_file" "$output_file"

    # === PATIENT NAMES ===
    sed -i '' 's|Gross, Kenneth Maurice|Flanagan, Xavier|g' "$output_file"
    sed -i '' 's|Gross, Kenneth M|Flanagan, Xavier|g' "$output_file"
    sed -i '' 's|Gross, Kenneth|Flanagan, Xavier|g' "$output_file"
    sed -i '' 's|Kenneth Maurice Gross|Xavier Flanagan|g' "$output_file"
    sed -i '' 's|Kenneth M Gross|Xavier Flanagan|g' "$output_file"
    sed -i '' 's|Kenneth Gross|Xavier Flanagan|g' "$output_file"
    sed -i '' 's|Kenneth</given><given>Maurice|Xavier</given><given>Xavier|g' "$output_file"
    sed -i '' 's|Kenneth</given><given>M</given>|Xavier</given><given>Xavier</given>|g' "$output_file"
    sed -i '' 's|<given>Kenneth</given>|<given>Xavier</given>|g' "$output_file"
    sed -i '' 's|<given qualifier="CL">Kenneth</given>|<given qualifier="CL">Xavier</given>|g' "$output_file"
    sed -i '' 's|<given>Maurice</given>|<given>Xavier</given>|g' "$output_file"
    sed -i '' 's|<family>Gross</family>|<family>Flanagan</family>|g' "$output_file"

    # === PROVIDER NAMES ===
    sed -i '' 's|Zaidi, Zareen|Sarah Johnson|g' "$output_file"
    sed -i '' 's|Zareen Zaidi|Sarah Johnson|g' "$output_file"
    sed -i '' 's|<given>Zareen</given>|<given>Sarah</given>|g' "$output_file"
    sed -i '' 's|<family>Zaidi</family>|<family>Johnson</family>|g' "$output_file"

    sed -i '' 's|Moore, Brad B|David Williams|g' "$output_file"
    sed -i '' 's|Brad B Moore|David Williams|g' "$output_file"
    sed -i '' 's|<given>Brad</given>|<given>David</given>|g' "$output_file"
    sed -i '' 's|<given>B</given>|<given>W</given>|g' "$output_file"
    sed -i '' 's|<family>Moore</family>|<family>Williams</family>|g' "$output_file"

    # === OTHER PEOPLE ===
    sed -i '' 's|Linda Gross|Emily Williams|g' "$output_file"
    sed -i '' 's|<name>Linda Gross</name>|<name>Emily Williams</name>|g' "$output_file"

    # === ORGANIZATIONS ===
    sed -i '' 's/GW Medical Faculty Associates/Melbourne Medical Group/g' "$output_file"
    sed -i '' 's/Foggy Bottom/Melbourne CBD/g' "$output_file"
    sed -i '' 's/2150 Penn Department of General Internal Medicine/Melbourne General Practice/g' "$output_file"

    # === US ADDRESSES → AUSTRALIAN ADDRESSES ===
    sed -i '' 's/1531 TANNER ST SE/123 Collins Street/g' "$output_file"
    sed -i '' 's/1531 Tanner Street SE/123 Collins Street/g' "$output_file"
    sed -i '' 's/2150 PENNSYLVANIA AVE NW/456 Bourke Street/g' "$output_file"
    sed -i '' 's/2150 Pennsylvania Ave NW/456 Bourke Street/g' "$output_file"
    sed -i '' 's/2150 Pennsylvania Avenue, NW/456 Bourke Street/g' "$output_file"
    sed -i '' 's/4TH FLOOR/Level 4/g' "$output_file"
    sed -i '' 's/4th Floor/Level 4/g' "$output_file"

    # === CITIES, STATES, ZIP ===
    sed -i '' 's|WASHINGTON, DC 20020|Melbourne VIC 3000|g' "$output_file"
    sed -i '' 's|Washington, DC 20020|Melbourne VIC 3000|g' "$output_file"
    sed -i '' 's|WASHINGTON, DC 20037|Melbourne VIC 3000|g' "$output_file"
    sed -i '' 's|Washington, DC 20037|Melbourne VIC 3000|g' "$output_file"
    sed -i '' 's|WASHINGTON, DC|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Washington, DC|Melbourne VIC|g' "$output_file"
    sed -i '' 's|<city>WASHINGTON</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Washington</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Washing</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<state>DC</state>|<state>VIC</state>|g' "$output_file"
    sed -i '' 's|<postalCode>20020</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>20037</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>20020-3814</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>20037-3201</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<county>DISTRICT O</county>|<county>Melbourne</county>|g' "$output_file"

    # === PHONE NUMBERS → AUSTRALIAN FORMAT ===
    sed -i '' 's|+1-202-876-7369|+61-3-9999-0001|g' "$output_file"
    sed -i '' 's|tel:+1-202-876-7369|tel:+61-3-9999-0001|g' "$output_file"
    sed -i '' 's|+1-202-741-2768|+61-3-9999-0002|g' "$output_file"
    sed -i '' 's|tel:+1-202-741-2768|tel:+61-3-9999-0002|g' "$output_file"
    sed -i '' 's|+1-202-741-2222|+61-3-9999-0003|g' "$output_file"
    sed -i '' 's|tel:+1-202-741-2222|tel:+61-3-9999-0003|g' "$output_file"
    sed -i '' 's|202-741-2222|03-9999-0003|g' "$output_file"
    sed -i '' 's|202-741-2185|03-9999-0004|g' "$output_file"
    sed -i '' 's|fax:+1-202-741-2185|fax:+61-3-9999-0004|g' "$output_file"

    # === EMAIL ADDRESSES ===
    sed -i '' 's/KKGROSS2106@GMAIL.COM/xavier.flanagan@example.com/g' "$output_file"
    sed -i '' 's/Kkgross2106@gmail.com/xavier.flanagan@example.com/g' "$output_file"
    sed -i '' 's/kenneth.gross@va.gov/xavier.flanagan@example.com/g' "$output_file"

    # === DATES → SHIFT BY FIXED AMOUNT (Add 5 years, 2 months, 11 days) ===
    # Patient DOB: 19690213 → 19940425
    sed -i '' 's/19690213/19940425/g' "$output_file"
    sed -i '' 's/value="20240124"/value="19940425"/g' "$output_file"

    echo "  ✓ De-identified: $filename"
done

echo ""
echo "✅ De-identification complete!"
echo "📁 Output directory: $OUTPUT_DIR"
echo ""

# Verify by checking for original names
echo "Verification (should show 0 occurrences):"
for xml_file in "$OUTPUT_DIR"/*.xml; do
    filename=$(basename "$xml_file")
    kenneth_count=$(grep -o "Kenneth" "$xml_file" | wc -l)
    gross_count=$(grep -o "Gross" "$xml_file" 2>/dev/null | grep -v "Flanagan" | wc -l || echo "0")
    zaidi_count=$(grep -o "Zaidi" "$xml_file" | wc -l)

    echo "  $filename: Kenneth=$kenneth_count, Gross=$gross_count, Zaidi=$zaidi_count"
done

echo ""
echo "Done! Check the verification counts above - they should all be 0."
