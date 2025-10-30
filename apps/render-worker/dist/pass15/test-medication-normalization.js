"use strict";
/**
 * Test Medication Normalization with Random PBS Samples
 *
 * Purpose: Validate medication normalization logic on 20 random PBS codes
 * before running full population
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// Import normalization function from worker
const normalization_1 = require("./normalization");
// Find project root
function findProjectRoot() {
    let currentDir = process.cwd();
    while (currentDir !== '/') {
        if (fs.existsSync(path.join(currentDir, 'package.json'))) {
            if (fs.existsSync(path.join(currentDir, 'apps'))) {
                return currentDir;
            }
        }
        currentDir = path.dirname(currentDir);
    }
    throw new Error('Could not find project root');
}
const projectRoot = findProjectRoot();
const envPath = path.join(projectRoot, '.env.production');
dotenv.config({ path: envPath });
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing environment variables');
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_KEY);
async function fetchRandomMedications(count) {
    console.log(`\nFetching ${count} random PBS medications...`);
    // Get total count first
    const { count: totalCount } = await supabase
        .from('regional_medical_codes')
        .select('*', { count: 'exact', head: true })
        .eq('code_system', 'pbs')
        .eq('entity_type', 'medication');
    if (!totalCount || totalCount === 0) {
        throw new Error('No PBS medications found');
    }
    console.log(`Total PBS medications: ${totalCount}`);
    // Fetch random samples by using random offsets
    const medications = [];
    const usedOffsets = new Set();
    while (medications.length < count) {
        const randomOffset = Math.floor(Math.random() * totalCount);
        if (usedOffsets.has(randomOffset)) {
            continue; // Skip duplicates
        }
        usedOffsets.add(randomOffset);
        const { data, error } = await supabase
            .from('regional_medical_codes')
            .select('code_value, display_name, search_text')
            .eq('code_system', 'pbs')
            .eq('entity_type', 'medication')
            .range(randomOffset, randomOffset)
            .limit(1);
        if (error) {
            console.error('Error fetching medication:', error);
            continue;
        }
        if (data && data.length > 0) {
            medications.push(data[0]);
        }
    }
    return medications;
}
async function testNormalization() {
    console.log('='.repeat(80));
    console.log('MEDICATION NORMALIZATION TEST - 20 RANDOM PBS CODES');
    console.log('='.repeat(80));
    try {
        const medications = await fetchRandomMedications(20);
        console.log('\n' + '='.repeat(80));
        console.log('NORMALIZATION RESULTS');
        console.log('='.repeat(80));
        let totalOriginalLength = 0;
        let totalNormalizedLength = 0;
        medications.forEach((med, idx) => {
            const normalized = (0, normalization_1.normalizeMedicationText)(med.display_name, med.search_text);
            const originalLen = med.display_name.length;
            const normalizedLen = normalized.length;
            const reduction = ((originalLen - normalizedLen) / originalLen * 100);
            totalOriginalLength += originalLen;
            totalNormalizedLength += normalizedLen;
            console.log(`\n${idx + 1}. CODE: ${med.code_value}`);
            console.log(`   Original:   ${med.display_name}`);
            console.log(`   Search:     ${med.search_text}`);
            console.log(`   Normalized: ${normalized}`);
            console.log(`   Reduction:  ${reduction.toFixed(1)}% (${originalLen} → ${normalizedLen} chars)`);
            // Highlight specific transformations
            const transformations = [];
            if (med.display_name.includes('(as ') && !normalized.includes('(as ')) {
                transformations.push('Salt removed');
            }
            if (/\d+\s*g\b/i.test(med.display_name) && /\d+\s*mg/.test(normalized)) {
                transformations.push('g→mg conversion');
            }
            if (normalized.length > med.display_name.length) {
                transformations.push('Brand added');
            }
            if (med.display_name.includes('extended release') || med.display_name.includes('modified release')) {
                transformations.push('Release type preserved');
            }
            if (transformations.length > 0) {
                console.log(`   Features:   ${transformations.join(', ')}`);
            }
        });
        // Summary statistics
        const avgReduction = ((totalOriginalLength - totalNormalizedLength) / totalOriginalLength * 100);
        console.log('\n' + '='.repeat(80));
        console.log('SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total medications tested: ${medications.length}`);
        console.log(`Average length reduction: ${avgReduction.toFixed(1)}%`);
        console.log(`Total original length: ${totalOriginalLength} chars`);
        console.log(`Total normalized length: ${totalNormalizedLength} chars`);
        console.log('\n📋 VALIDATION CHECKLIST:');
        console.log('  [ ] Salt forms removed (hydrochloride, arginine, etc.)');
        console.log('  [ ] Unit conversions correct (g→mg, mcg→mg)');
        console.log('  [ ] Brand names preserved appropriately');
        console.log('  [ ] Release types maintained when important');
        console.log('  [ ] Clinical distinctiveness preserved');
        console.log('  [ ] No critical information lost');
        console.log('\n='.repeat(80));
    }
    catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}
testNormalization()
    .then(() => {
    console.log('\n✅ Test complete');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
});
//# sourceMappingURL=test-medication-normalization.js.map