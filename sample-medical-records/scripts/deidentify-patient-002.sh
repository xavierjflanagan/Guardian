#!/bin/bash

# De-identification script for Patient 002 - Sarah Chen
# Original: Donald Gray, FAIRBURN GA, Cleveland Clinic
# Target: Sarah Chen, Melbourne VIC 3000

set -e

PATIENT_DIR="patient-002-sarah-chen"
SOURCE_DIR="$PATIENT_DIR/source-xml"
OUTPUT_DIR="$PATIENT_DIR/de-identified-xml"

echo "De-identifying Patient 002 - Sarah Chen..."
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
    sed -i '' 's|Gray, Donald|Chen, Sarah|g' "$output_file"
    sed -i '' 's|Donald M Gray|Sarah M Chen|g' "$output_file"
    sed -i '' 's|Donald Gray|Sarah Chen|g' "$output_file"
    sed -i '' 's|<given>Donald</given>|<given>Sarah</given>|g' "$output_file"
    sed -i '' 's|<family>Gray</family>|<family>Chen</family>|g' "$output_file"
    sed -i '' 's|<family>Grady</family>|<family>Chen</family>|g' "$output_file"
    # Narrative text occurrences
    sed -i '' 's|Donald</given><given>M|Sarah</given><given>M|g' "$output_file"

    # === EMAIL ADDRESSES ===
    sed -i '' 's|mrgray744@gmail.com|sarah.chen@example.com|g' "$output_file"

    # === RELATED PEOPLE ===
    sed -i '' 's|Lela Gray|Emily Chen|g' "$output_file"
    sed -i '' 's|<name>Lela Gray</name>|<name>Emily Chen</name>|g' "$output_file"

    # === PROVIDER NAMES ===
    sed -i '' 's|Danielle Kline|Sarah Johnson|g' "$output_file"
    sed -i '' 's|<given>Danielle</given>|<given>Sarah</given>|g' "$output_file"
    sed -i '' 's|<family>Kline</family>|<family>Johnson</family>|g' "$output_file"

    sed -i '' 's|Jason Travis Milk|David Williams|g' "$output_file"
    sed -i '' 's|Jason</given><given>Travis|David</given><given>David|g' "$output_file"
    sed -i '' 's|<given>Jason</given>|<given>David</given>|g' "$output_file"
    sed -i '' 's|<given>Travis</given>|<given>David</given>|g' "$output_file"
    sed -i '' 's|<family>Milk</family>|<family>Williams</family>|g' "$output_file"

    sed -i '' 's|Ccf Provider|Melbourne Provider|g' "$output_file"

    # === ORGANIZATIONS ===
    sed -i '' 's|Cleveland Clinic|Melbourne Medical Group|g' "$output_file"

    # === US ADDRESSES → AUSTRALIAN ADDRESSES ===
    sed -i '' 's|5110 LINCOLN DR|123 Collins Street|g' "$output_file"
    sed -i '' 's|5110 Lincoln Dr|123 Collins Street|g' "$output_file"
    sed -i '' 's|9500 Euclid Avenue|456 Bourke Street|g' "$output_file"
    sed -i '' 's|9500 EUCLID AVE|456 Bourke Street|g' "$output_file"

    # === CITIES, STATES, ZIP ===
    sed -i '' 's|FAIRBURN, GA 30213|Melbourne VIC 3000|g' "$output_file"
    sed -i '' 's|Fairburn, GA 30213|Melbourne VIC 3000|g' "$output_file"
    sed -i '' 's|FAYETTEVILLE, GA|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Fayetteville, GA|Melbourne VIC|g' "$output_file"
    sed -i '' 's|ATLANTA, GA|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Atlanta, GA|Melbourne VIC|g' "$output_file"
    sed -i '' 's|CLEVELAND, OH 44195|Melbourne VIC 3000|g' "$output_file"
    sed -i '' 's|Cleveland, OH 44195|Melbourne VIC 3000|g' "$output_file"
    sed -i '' 's|<city>FAIRBURN</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Fairburn</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>FAYETTEVILLE</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Fayetteville</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>ATLANTA</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Atlanta</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>CLEVELAND</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Cleveland</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<state>GA</state>|<state>VIC</state>|g' "$output_file"
    sed -i '' 's|<state>OH</state>|<state>VIC</state>|g' "$output_file"
    sed -i '' 's|<postalCode>30213</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>30214</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>30309</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>30363</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>44195</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>30213-4444</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>30214-4526</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<county>CUYAHOGA</county>|<county>Melbourne</county>|g' "$output_file"
    sed -i '' 's|<county>FULTON</county>|<county>Melbourne</county>|g' "$output_file"
    sed -i '' 's|<county>FAYETTE</county>|<county>Melbourne</county>|g' "$output_file"

    # === PHONE NUMBERS → AUSTRALIAN FORMAT ===
    sed -i '' 's|+1-770-964-4582|+61-3-9999-0001|g' "$output_file"
    sed -i '' 's|tel:+1-770-964-4582|tel:+61-3-9999-0001|g' "$output_file"
    sed -i '' 's|+1-216-383-1717|+61-3-9999-0002|g' "$output_file"
    sed -i '' 's|tel:+1-216-383-1717|tel:+61-3-9999-0002|g' "$output_file"
    sed -i '' 's|+1-440-312-3130|+61-3-9999-0003|g' "$output_file"
    sed -i '' 's|tel:+1-440-312-3130|tel:+61-3-9999-0003|g' "$output_file"
    sed -i '' 's|+1-216-445-4580|+61-3-9999-0004|g' "$output_file"
    sed -i '' 's|fax:+1-216-445-4580|fax:+61-3-9999-0004|g' "$output_file"

    echo "  ✓ De-identified: $filename"
done

echo ""
echo "✅ De-identification complete for Patient 002!"
echo ""

# Verification
echo "Verification (should show 0 occurrences):"
for xml_file in "$OUTPUT_DIR"/*.xml; do
    filename=$(basename "$xml_file")
    donald_count=$(grep -o "Donald" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')
    gray_count=$(grep -o "Gray" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')
    cleveland_count=$(grep -o "Cleveland" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')

    echo "  $filename: Donald=$donald_count, Gray=$gray_count, Cleveland=$cleveland_count"
done

echo ""
echo "Done!"
