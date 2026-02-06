/**
 * PDF Form Field Extractor
 *
 * Extracts all form field names from the ACORD 25 PDF template
 * Run with: node scripts/extract-pdf-fields.js
 */

const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function extractPDFFields() {
    try {
        const pdfPath = path.join(__dirname, '../Resources/CERTIFICATE OF INSURANCE (202512).PDF');

        console.log('📄 Reading PDF:', pdfPath);
        const pdfBytes = fs.readFileSync(pdfPath);

        console.log('📖 Loading PDF document...');
        const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

        console.log('📋 Extracting form fields...\n');
        const form = pdfDoc.getForm();
        const fields = form.getFields();

        if (fields.length === 0) {
            console.log('⚠️  No form fields found. PDF may be flattened or have no interactive fields.');
            return;
        }

        console.log(`✅ Found ${fields.length} form fields:\n`);
        console.log('=' .repeat(80));

        // Group fields by type
        const fieldsByType = {
            text: [],
            checkbox: [],
            radio: [],
            dropdown: [],
            other: []
        };

        fields.forEach(field => {
            const name = field.getName();
            const type = field.constructor.name;

            // Categorize by type
            if (type.includes('Text') || type.includes('TextField')) {
                fieldsByType.text.push(name);
            } else if (type.includes('CheckBox')) {
                fieldsByType.checkbox.push(name);
            } else if (type.includes('Radio')) {
                fieldsByType.radio.push(name);
            } else if (type.includes('Dropdown') || type.includes('Option')) {
                fieldsByType.dropdown.push(name);
            } else {
                fieldsByType.other.push(name);
            }
        });

        // Print organized output
        console.log('\n📝 TEXT FIELDS:');
        console.log('-'.repeat(80));
        fieldsByType.text.forEach(name => console.log(`  - ${name}`));

        if (fieldsByType.checkbox.length > 0) {
            console.log('\n☑️  CHECKBOXES:');
            console.log('-'.repeat(80));
            fieldsByType.checkbox.forEach(name => console.log(`  - ${name}`));
        }

        if (fieldsByType.radio.length > 0) {
            console.log('\n🔘 RADIO BUTTONS:');
            console.log('-'.repeat(80));
            fieldsByType.radio.forEach(name => console.log(`  - ${name}`));
        }

        if (fieldsByType.dropdown.length > 0) {
            console.log('\n📋 DROPDOWNS:');
            console.log('-'.repeat(80));
            fieldsByType.dropdown.forEach(name => console.log(`  - ${name}`));
        }

        if (fieldsByType.other.length > 0) {
            console.log('\n❓ OTHER:');
            console.log('-'.repeat(80));
            fieldsByType.other.forEach(name => console.log(`  - ${name}`));
        }

        console.log('\n' + '='.repeat(80));
        console.log(`\n✅ Extraction complete! Found ${fields.length} total fields.`);

        // Save to JSON file
        const outputPath = path.join(__dirname, '../Resources/acord25-field-names.json');
        const fieldData = {
            totalFields: fields.length,
            extractedDate: new Date().toISOString(),
            fields: {
                text: fieldsByType.text,
                checkbox: fieldsByType.checkbox,
                radio: fieldsByType.radio,
                dropdown: fieldsByType.dropdown,
                other: fieldsByType.other
            }
        };

        fs.writeFileSync(outputPath, JSON.stringify(fieldData, null, 2));
        console.log(`\n💾 Field names saved to: ${outputPath}`);

    } catch (error) {
        console.error('❌ Error extracting PDF fields:', error.message);
        if (error.stack) {
            console.error('\nStack trace:', error.stack);
        }
    }
}

// Run extraction
extractPDFFields();
