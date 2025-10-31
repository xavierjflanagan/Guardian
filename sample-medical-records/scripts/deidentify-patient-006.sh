#!/bin/bash

# De-identification script for Patient 006 - Emma Thompson
# Original: Tina M Holloway, ALLENTOWN PA, St. Lukes University Health Network
# Target: Emma Thompson, Melbourne VIC 3000

set -e

PATIENT_DIR="patient-006-emma-thompson"
SOURCE_DIR="$PATIENT_DIR/source-xml"
OUTPUT_DIR="$PATIENT_DIR/de-identified-xml"

echo "De-identifying Patient 006 - Emma Thompson..."
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
    sed -i '' 's|Holloway, Tina M|Thompson, Emma|g' "$output_file"
    sed -i '' 's|Holloway, Tina|Thompson, Emma|g' "$output_file"
    sed -i '' 's|Tina M Holloway|Emma Thompson|g' "$output_file"
    sed -i '' 's|Tina Holloway|Emma Thompson|g' "$output_file"
    sed -i '' 's|<given>Tina</given>|<given>Emma</given>|g' "$output_file"
    sed -i '' 's|Tina</given><given>M|Emma</given><given>Emma|g' "$output_file"
    sed -i '' 's|<given>M</given>|<given>Emma</given>|g' "$output_file"
    sed -i '' 's|<family>Holloway</family>|<family>Thompson</family>|g' "$output_file"

    # === EMAIL ADDRESSES ===
    sed -i '' 's|tinaholloway2008@yahoo.com|emma.thompson@example.com|g' "$output_file"

    # === RELATED PEOPLE ===
    sed -i '' 's|Asia Rozier|Emily Thompson|g' "$output_file"
    sed -i '' 's|<name>Asia Rozier</name>|<name>Emily Thompson</name>|g' "$output_file"

    # === PROVIDER NAMES ===
    sed -i '' 's|Michael Nimeh|Sarah Johnson|g' "$output_file"
    sed -i '' 's|<given>Michael</given>|<given>Sarah</given>|g' "$output_file"
    sed -i '' 's|<family>Nimeh</family>|<family>Johnson</family>|g' "$output_file"

    sed -i '' 's|Jamie L Cernobyl|David Williams|g' "$output_file"
    sed -i '' 's|Jamie</given><given>L|David</given><given>David|g' "$output_file"
    sed -i '' 's|<given>Jamie</given>|<given>David</given>|g' "$output_file"
    sed -i '' 's|<given>L</given>|<given>David</given>|g' "$output_file"
    sed -i '' 's|<family>Cernobyl</family>|<family>Williams</family>|g' "$output_file"

    # === US ADDRESSES → AUSTRALIAN ADDRESSES ===
    sed -i '' 's|723 Half W WHITEHALL ST|123 Collins Street|g' "$output_file"
    sed -i '' 's|723 W WHITEHALL ST|123 Collins Street|g' "$output_file"
    sed -i '' 's|723 W Whitehall St|123 Collins Street|g' "$output_file"
    sed -i '' 's|801 Ostrum Street|456 Bourke Street|g' "$output_file"
    sed -i '' 's|123 Anywhere Street|789 Flinders Street|g' "$output_file"

    # === CITIES, STATES, ZIP ===
    sed -i '' 's|ALLENTOWN, PA|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Allentown, PA|Melbourne VIC|g' "$output_file"
    sed -i '' 's|BETHLEHEM, PA|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Bethlehem, PA|Melbourne VIC|g' "$output_file"
    sed -i '' 's|MADISON, WI|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Madison, WI|Melbourne VIC|g' "$output_file"
    sed -i '' 's|<city>ALLENTOWN</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Allentown</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>BETHLEHEM</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Bethlehem</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>MADISON</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Madison</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<state>PA</state>|<state>VIC</state>|g' "$output_file"
    sed -i '' 's|<state>WI</state>|<state>VIC</state>|g' "$output_file"
    sed -i '' 's|<postalCode>18102</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>18102-1535</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>18015</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>53711</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<county>LEHIGH</county>|<county>Melbourne</county>|g' "$output_file"
    sed -i '' 's|<county>DANE</county>|<county>Melbourne</county>|g' "$output_file"

    # === PHONE NUMBERS → AUSTRALIAN FORMAT ===
    sed -i '' 's|+1-484-951-1336|+61-3-9999-0001|g' "$output_file"
    sed -i '' 's|tel:+1-484-951-1336|tel:+61-3-9999-0001|g' "$output_file"
    sed -i '' 's|+1-610-972-0961|+61-3-9999-0002|g' "$output_file"
    sed -i '' 's|tel:+1-610-972-0961|tel:+61-3-9999-0002|g' "$output_file"
    sed -i '' 's|+1-484-240-8195|+61-3-9999-0003|g' "$output_file"
    sed -i '' 's|tel:+1-484-240-8195|tel:+61-3-9999-0003|g' "$output_file"
    sed -i '' 's|+1-610-266-3062|+61-3-9999-0004|g' "$output_file"
    sed -i '' 's|fax:+1-610-266-3062|fax:+61-3-9999-0004|g' "$output_file"
    sed -i '' 's|+1-484-526-5024|+61-3-9999-0005|g' "$output_file"
    sed -i '' 's|tel:+1-484-526-5024|tel:+61-3-9999-0005|g' "$output_file"
    sed -i '' 's|+1-555-555-5555|+61-3-9999-0006|g' "$output_file"
    sed -i '' 's|tel:+1-555-555-5555|tel:+61-3-9999-0006|g' "$output_file"

    # === ORGANIZATIONS ===
    sed -i '' 's|St. Lukes University Health Network|Melbourne Health Network|g' "$output_file"
    sed -i '' 's|St Lukes University Health Network|Melbourne Health Network|g' "$output_file"

    echo "  ✓ De-identified: $filename"
done

echo ""
echo "✅ De-identification complete for Patient 006!"
echo ""

# Verification
echo "Verification (should show 0 occurrences):"
for xml_file in "$OUTPUT_DIR"/*.xml; do
    filename=$(basename "$xml_file")
    tina_count=$(grep -o "Tina" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')
    holloway_count=$(grep -o "Holloway" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')
    allentown_count=$(grep -o "Allentown\|ALLENTOWN" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')

    echo "  $filename: Tina=$tina_count, Holloway=$holloway_count, Allentown=$allentown_count"
done

echo ""
echo "Done!"
