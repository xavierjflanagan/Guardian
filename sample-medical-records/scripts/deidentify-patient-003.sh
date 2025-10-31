#!/bin/bash

# De-identification script for Patient 003 - Michael Rodriguez
# Original: Lora Flowers, CHICAGO IL, Exact Sciences / NorthShore
# Target: Michael Rodriguez, Melbourne VIC 3000

set -e

PATIENT_DIR="patient-003-michael-rodriguez"
SOURCE_DIR="$PATIENT_DIR/source-xml"
OUTPUT_DIR="$PATIENT_DIR/de-identified-xml"

echo "De-identifying Patient 003 - Michael Rodriguez..."
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
    sed -i '' 's|Flowers, Lora|Rodriguez, Michael|g' "$output_file"
    sed -i '' 's|Lora Flowers|Michael Rodriguez|g' "$output_file"
    sed -i '' 's|<given>Lora</given>|<given>Michael</given>|g' "$output_file"
    sed -i '' 's|<family>Flowers</family>|<family>Rodriguez</family>|g' "$output_file"

    # === EMAIL ADDRESSES ===
    sed -i '' 's|loraflo36@gmail.com|michael.rodriguez@example.com|g' "$output_file"

    # === PROVIDER NAMES ===
    sed -i '' 's|Jamie Lynne Ellingwood|Sarah Johnson|g' "$output_file"
    sed -i '' 's|<given>Jamie</given>|<given>Sarah</given>|g' "$output_file"
    sed -i '' 's|<given>Lynne</given>|<given>Sarah</given>|g' "$output_file"
    sed -i '' 's|<family>Ellingwood</family>|<family>Johnson</family>|g' "$output_file"

    sed -i '' 's|Ericka Paige Harmon|David Williams|g' "$output_file"
    sed -i '' 's|<given>Ericka</given>|<given>David</given>|g' "$output_file"
    sed -i '' 's|<given>Paige</given>|<given>David</given>|g' "$output_file"
    sed -i '' 's|<family>Harmon</family>|<family>Williams</family>|g' "$output_file"

    sed -i '' 's|Peter P Mayock|James Thompson|g' "$output_file"
    sed -i '' 's|<given>Peter</given>|<given>James</given>|g' "$output_file"
    sed -i '' 's|Peter</given><given>P|James</given><given>James|g' "$output_file"
    sed -i '' 's|<family>Mayock</family>|<family>Thompson</family>|g' "$output_file"

    # === US ADDRESSES → AUSTRALIAN ADDRESSES ===
    sed -i '' 's|5630 N SHERIDAN RD|123 Collins Street|g' "$output_file"
    sed -i '' 's|5630 N Sheridan Rd|123 Collins Street|g' "$output_file"
    sed -i '' 's|5710 N BROADWAY ST|456 Bourke Street|g' "$output_file"
    sed -i '' 's|5710 N Broadway St|456 Bourke Street|g' "$output_file"
    sed -i '' 's|APT 1104|Unit 1104|g' "$output_file"
    sed -i '' 's|APT 104|Unit 104|g' "$output_file"
    sed -i '' 's|1301 W Devon Ave|789 Flinders Street|g' "$output_file"
    sed -i '' 's|6111 Oak Tree Boulevard Suite 301|321 Lonsdale Street Suite 301|g' "$output_file"
    sed -i '' 's|145 E. Badger Road|100 Swanston Street|g' "$output_file"
    sed -i '' 's|145 Badger Road|100 Swanston Street|g' "$output_file"

    # === CITIES, STATES, ZIP ===
    sed -i '' 's|CHICAGO, IL|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Chicago, IL|Melbourne VIC|g' "$output_file"
    sed -i '' 's|INDEPENDENCE, OH|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Independence, OH|Melbourne VIC|g' "$output_file"
    sed -i '' 's|MADISON, WI|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Madison, WI|Melbourne VIC|g' "$output_file"
    sed -i '' 's|VERONA, WI|Melbourne VIC|g' "$output_file"
    sed -i '' 's|Verona, WI|Melbourne VIC|g' "$output_file"
    sed -i '' 's|<city>CHICAGO</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Chicago</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>INDEPENDENCE</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Independence</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>MADISON</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Madison</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>VERONA</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<city>Verona</city>|<city>Melbourne</city>|g' "$output_file"
    sed -i '' 's|<state>IL</state>|<state>VIC</state>|g' "$output_file"
    sed -i '' 's|<state>OH</state>|<state>VIC</state>|g' "$output_file"
    sed -i '' 's|<state>WI</state>|<state>VIC</state>|g' "$output_file"
    sed -i '' 's|<postalCode>60660</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>60660-4860</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>60660-4840</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>44131</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>53713</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<postalCode>53753</postalCode>|<postalCode>3000</postalCode>|g' "$output_file"
    sed -i '' 's|<county>COOK</county>|<county>Melbourne</county>|g' "$output_file"
    sed -i '' 's|<county>CUYAHOGA</county>|<county>Melbourne</county>|g' "$output_file"
    sed -i '' 's|<county>DANE</county>|<county>Melbourne</county>|g' "$output_file"

    # === PHONE NUMBERS → AUSTRALIAN FORMAT ===
    sed -i '' 's|+1-773-571-8288|+61-3-9999-0001|g' "$output_file"
    sed -i '' 's|tel:+1-773-571-8288|tel:+61-3-9999-0001|g' "$output_file"
    sed -i '' 's|+1-773-751-7800|+61-3-9999-0002|g' "$output_file"
    sed -i '' 's|tel:+1-773-751-7800|tel:+61-3-9999-0002|g' "$output_file"
    sed -i '' 's|+1-833-819-0292|+61-3-9999-0003|g' "$output_file"
    sed -i '' 's|fax:+1-833-819-0292|fax:+61-3-9999-0003|g' "$output_file"
    sed -i '' 's|+1-833-539-0240|+61-3-9999-0004|g' "$output_file"
    sed -i '' 's|tel:+1-833-539-0240|tel:+61-3-9999-0004|g' "$output_file"
    sed -i '' 's|+1-888-897-9153|+61-3-9999-0005|g' "$output_file"
    sed -i '' 's|fax:+1-888-897-9153|fax:+61-3-9999-0005|g' "$output_file"
    sed -i '' 's|+1-844-870-8870|+61-3-9999-0006|g' "$output_file"
    sed -i '' 's|tel:+1-844-870-8870|tel:+61-3-9999-0006|g' "$output_file"
    sed -i '' 's|tel:555-5555|tel:+61-3-9999-0007|g' "$output_file"

    # === ORGANIZATIONS ===
    sed -i '' 's|Exact Sciences Laboratories|Melbourne Medical Laboratory|g' "$output_file"
    sed -i '' 's|NorthShore University HealthSystem|Melbourne Health Network|g' "$output_file"

    # === EMAIL ADDRESSES (Organizations) ===
    sed -i '' 's|clinicallabqa@exactsciences.com|lab@melbournemedical.example.com|g' "$output_file"

    echo "  ✓ De-identified: $filename"
done

echo ""
echo "✅ De-identification complete for Patient 003!"
echo ""

# Verification
echo "Verification (should show 0 occurrences):"
for xml_file in "$OUTPUT_DIR"/*.xml; do
    filename=$(basename "$xml_file")
    lora_count=$(grep -o "Lora" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')
    flowers_count=$(grep -o "Flowers" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')
    chicago_count=$(grep -o "Chicago" "$xml_file" 2>/dev/null | wc -l | tr -d ' ')

    echo "  $filename: Lora=$lora_count, Flowers=$flowers_count, Chicago=$chicago_count"
done

echo ""
echo "Done!"
