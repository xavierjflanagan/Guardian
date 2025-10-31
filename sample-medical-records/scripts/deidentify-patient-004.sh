#!/bin/bash

# De-identification script for Patient 004 - Jennifer Patel
# Original: Roger Lee Green, UNION SC, Prisma Health / Spartanburg Regional
# Target: Jennifer Patel, Melbourne VIC 3000

set -e

PATIENT_DIR="patient-004-jennifer-patel"
SOURCE_DIR="$PATIENT_DIR/source-xml"
OUTPUT_DIR="$PATIENT_DIR/de-identified-xml"

echo "De-identifying Patient 004 - Jennifer Patel..."
echo "Source: $SOURCE_DIR"
echo "Output: $OUTPUT_DIR"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Process each XML file
for xml_file in "$SOURCE_DIR"/*.xml; do
    if [ ! -f "$xml_file" ]; then
        echo "No XML files found in: $SOURCE_DIR"
        exit 1
    fi

    filename=$(basename "$xml_file")
    echo "Processing: $filename"
    output_file="$OUTPUT_DIR/$filename"

    # Copy file to output
    cp "$xml_file" "$output_file"

    # === PATIENT NAMES ===
    sed -i '' 's|Green, Roger Lee|Patel, Jennifer|g' "$output_file"
    sed -i '' 's|Green, Roger L|Patel, Jennifer|g' "$output_file"
    sed -i '' 's|Green, Roger|Patel, Jennifer|g' "$output_file"
    sed -i '' 's|Roger Lee Green|Jennifer Patel|g' "$output_file"
    sed -i '' 's|Roger L Green|Jennifer Patel|g' "$output_file"
    sed -i '' 's|Roger Green|Jennifer Patel|g' "$output_file"
    sed -i '' 's|<given>Roger</given>|<given>Jennifer</given>|g' "$output_file"
    sed -i '' 's|Roger</given><given>L|Jennifer</given><given>Jennifer|g' "$output_file"
    sed -i '' 's|Roger</given><given>Lee|Jennifer</given><given>Jennifer|g' "$output_file"
    sed -i '' 's|<given>L</given>|<given>Jennifer</given>|g' "$output_file"
    sed -i '' 's|<given>Lee</given>|<given>Jennifer</given>|g' "$output_file"
    sed -i '' 's|<family>Green</family>|<family>Patel</family>|g' "$output_file"

    # === EMAIL ADDRESSES ===
    sed -i '' 's|rg5563871@gmail.com|jennifer.patel@example.com|g' "$output_file"

    # === RELATED PEOPLE ===
    sed -i '' 's|Mary Green|Emily Patel|g' "$output_file"
    sed -i '' 's|<name>Mary Green</name>|<name>Emily Patel</name>|g' "$output_file"

    # === PROVIDER NAMES ===
    sed -i '' 's|Shannon McCarter|Sarah Johnson|g' "$output_file"
    sed -i '' 's|<given>Shannon</given>|<given>Sarah</given>|g' "$output_file"
    sed -i '' 's|<family>McCarter</family>|<family>Johnson</family>|g' "$output_file"

    sed -i '' 's|James Kenneth Pittman|David Williams|g' "$output_file"
    sed -i '' 's|James</given><given>Kenneth|David</given><given>David|g' "$output_file"
    sed -i '' 's|<given>James</given>|<given>David</given>|g' "$output_file"
    sed -i '' 's|<given>Kenneth</given>|<given>David</given>|g' "$output_file"
    sed -i '' 's|<family>Pittman</family>|<family>Williams</family>|g' "$output_file"

    # === US ADDRESSES → AUSTRALIAN ADDRESSES ===
    sed -i '' 's|131 WISEMAN RD|123 Collins Street|g' "$output_file"
    sed -i '' 's|131 Wiseman Rd|123 Collins Street|g' "$output_file"
    sed -i '' 's|701 GROVE ROAD|456 Bourke Street|g' "$output_file"
    sed -i '' 's|701 Grove Road|456 Bourke Street|g' "$output_file"

    # === CITIES, STATES, ZIP ===
    sed -i '' 's|UNION, SC|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Union, SC|Melbourne VIC|g' "$output_file"
    sed -i '' 's|GREENVILLE, SC|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Greenville, SC|Melbourne VIC|g' "$output_file"
    sed -i '' 's|<city>UNION</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Union</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>GREENVILLE</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Greenville</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<state>SC</state>|<state>VIC</state>|g' "$output_file"
    sed -i '' 's|<postalCode>29379-9292</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>29379</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>29605</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<county>UNION</county>|<county>Melbourne</county>|g' "$output_file"
    sed -i '' 's|<county>UNION SC</county>|<county>Melbourne</county>|g' "$output_file"

    # === PHONE NUMBERS → AUSTRALIAN FORMAT ===
    sed -i '' 's|+1-864-251-3243|+61-3-9999-0001|g' "$output_file"
    sed -i '' 's|tel:+1-864-251-3243|tel:+61-3-9999-0001|g' "$output_file"
    sed -i '' 's|+1-864-466-8240|+61-3-9999-0002|g' "$output_file"
    sed -i '' 's|tel:+1-864-466-8240|tel:+61-3-9999-0002|g' "$output_file"

    # === ORGANIZATIONS ===
    sed -i '' 's|Prisma Health|Melbourne Health Network|g' "$output_file"
    sed -i '' 's|Spartanburg Regional Healthcare System|Melbourne Regional Healthcare|g' "$output_file"

    echo "  ✓ De-identified: $filename"
done

echo ""
echo "✅ De-identification complete for Patient 004!"
echo ""

# Verification
echo "Verification (should show 0 occurrences):"
for xml_file in "$OUTPUT_DIR"/*.xml; do
    filename=$(basename "$xml_file")
    roger_count=$(grep -o "Roger" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')
    green_count=$(grep -o "Green" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')
    union_count=$(grep -o "Union" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')

    echo "  $filename: Roger=$roger_count, Green=$green_count, Union=$union_count"
done

echo ""
echo "Done!"
