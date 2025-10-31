#!/bin/bash

# De-identification script for Patient 005 - David Nguyen
# Original: Falicia Thomas Jahnke, MESQUITE TX, Parkland
# Target: David Nguyen, Melbourne VIC 3000

set -e

PATIENT_DIR="patient-005-david-nguyen"
SOURCE_DIR="$PATIENT_DIR/source-xml"
OUTPUT_DIR="$PATIENT_DIR/de-identified-xml"

echo "De-identifying Patient 005 - David Nguyen..."
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

    # === PATIENT NAMES (Complex - multiple variations) ===
    # Full name combinations
    sed -i '' 's|Jahnke, Falicia Thomas|Nguyen, David|g' "$output_file"
    sed -i '' 's|Jahnke, Falicia|Nguyen, David|g' "$output_file"
    sed -i '' 's|Thomas, Falicia|Nguyen, David|g' "$output_file"
    sed -i '' 's|Thomas, Felecia|Nguyen, David|g' "$output_file"
    sed -i '' 's|Falicia Thomas Jahnke|David Nguyen|g' "$output_file"
    sed -i '' 's|Felecia Thomas|David Nguyen|g' "$output_file"
    sed -i '' 's|Falicia Jahnke|David Nguyen|g' "$output_file"
    sed -i '' 's|Falicia Thomas|David Nguyen|g' "$output_file"

    # Given name replacements
    sed -i '' 's|<given>Falicia</given>|<given>David</given>|g' "$output_file"
    sed -i '' 's|<given>Felecia</given>|<given>David</given>|g' "$output_file"
    sed -i '' 's|<given qualifier="CL">Falicia</given>|<given qualifier="CL">David</given>|g' "$output_file"
    sed -i '' 's|Falicia</given><given>Thomas|David</given><given>David|g' "$output_file"
    sed -i '' 's|<given>Thomas</given>|<given>David</given>|g' "$output_file"

    # Family name replacements
    sed -i '' 's|<family qualifier="SP">Jahnke</family>|<family>Nguyen</family>|g' "$output_file"
    sed -i '' 's|<family>Jahnke</family>|<family>Nguyen</family>|g' "$output_file"
    sed -i '' 's|<family>Thomas</family>|<family>Nguyen</family>|g' "$output_file"
    sed -i '' 's|<family qualifier="BR">Thomas</family>|<family>Nguyen</family>|g' "$output_file"

    # === EMAIL ADDRESSES ===
    sed -i '' 's|Jahnkefalicia15@gmail.com|david.nguyen@example.com|g' "$output_file"
    sed -i '' 's|fjahnke42@gmail.com|david.nguyen@example.com|g' "$output_file"

    # === RELATED PEOPLE ===
    sed -i '' 's|Richard Crow|Emily Nguyen|g' "$output_file"
    sed -i '' 's|<name>Richard Crow</name>|<name>Emily Nguyen</name>|g' "$output_file"

    # === PROVIDER NAMES ===
    sed -i '' 's|Susana M. Lazarte|Sarah Johnson|g' "$output_file"
    sed -i '' 's|Susana M Lazarte|Sarah Johnson|g' "$output_file"
    sed -i '' 's|Susana</given><given>M.|Sarah</given><given>Sarah|g' "$output_file"
    sed -i '' 's|<given>Susana</given>|<given>Sarah</given>|g' "$output_file"
    sed -i '' 's|<given>M.</given>|<given>Sarah</given>|g' "$output_file"
    sed -i '' 's|<family>Lazarte</family>|<family>Johnson</family>|g' "$output_file"

    # === US ADDRESSES → AUSTRALIAN ADDRESSES ===
    sed -i '' 's|2021 HILL Crst APT 2075|123 Collins Street Unit 2075|g' "$output_file"
    sed -i '' 's|2021 Hill Crest|123 Collins Street|g' "$output_file"
    sed -i '' 's|2021 HILLCREST ST 2075|123 Collins Street Unit 2075|g' "$output_file"
    sed -i '' 's|2021 Spanish Range Dr|123 Collins Street|g' "$output_file"
    sed -i '' 's|Apt 2075|Unit 2075|g' "$output_file"
    sed -i '' 's|APT 2075|Unit 2075|g' "$output_file"
    sed -i '' 's|5200 Harry Hines Blvd|456 Bourke Street|g' "$output_file"
    sed -i '' 's|5303 HARRY HINES BLVD|789 Flinders Street|g' "$output_file"
    sed -i '' 's|5151 Maple Avenue|321 Lonsdale Street|g' "$output_file"

    # === CITIES, STATES, ZIP ===
    sed -i '' 's|MESQUITE, TX|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Mesquite, TX|Melbourne VIC|g' "$output_file"
    sed -i '' 's|DALLAS, TX|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Dallas, TX|Melbourne VIC|g' "$output_file"
    sed -i '' 's|<city>MESQUITE</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Mesquite</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>DALLAS</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Dallas</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<state>TX</state>|<state>VIC</state>|g' "$output_file"
    sed -i '' 's|<postalCode>75149</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>75235</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>75390</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<county>DALLAS</county>|<county>Melbourne</county>|g' "$output_file"

    # === PHONE NUMBERS → AUSTRALIAN FORMAT ===
    sed -i '' 's|+1-936-899-0673|+61-3-9999-0001|g' "$output_file"
    sed -i '' 's|tel:+1-936-899-0673|tel:+61-3-9999-0001|g' "$output_file"
    sed -i '' 's|+1-469-775-5479|+61-3-9999-0002|g' "$output_file"
    sed -i '' 's|tel:+1-469-775-5479|tel:+61-3-9999-0002|g' "$output_file"
    sed -i '' 's|+1-214-645-2800|+61-3-9999-0003|g' "$output_file"
    sed -i '' 's|tel:+1-214-645-2800|tel:+61-3-9999-0003|g' "$output_file"
    sed -i '' 's|+1-214-590-5632|+61-3-9999-0004|g' "$output_file"
    sed -i '' 's|tel:+1-214-590-5632|tel:+61-3-9999-0004|g' "$output_file"

    # === ORGANIZATIONS ===
    sed -i '' 's|Parkland|Melbourne Health Network|g' "$output_file"

    # === LOCATION NAMES ===
    sed -i '' 's|ACCESS Clinic at Moody Outpatient Center|Melbourne Outpatient Medical Centre|g' "$output_file"
    sed -i '' 's|PMH NEW PARKLAND|Melbourne Medical Centre|g' "$output_file"

    echo "  ✓ De-identified: $filename"
done

echo ""
echo "✅ De-identification complete for Patient 005!"
echo ""

# Verification
echo "Verification (should show 0 occurrences):"
for xml_file in "$OUTPUT_DIR"/*.xml; do
    filename=$(basename "$xml_file")
    falicia_count=$(grep -o "Falicia\|Felecia" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')
    jahnke_count=$(grep -o "Jahnke" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')
    mesquite_count=$(grep -o "Mesquite\|MESQUITE" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')

    echo "  $filename: Falicia/Felecia=$falicia_count, Jahnke=$jahnke_count, Mesquite=$mesquite_count"
done

echo ""
echo "Done!"
