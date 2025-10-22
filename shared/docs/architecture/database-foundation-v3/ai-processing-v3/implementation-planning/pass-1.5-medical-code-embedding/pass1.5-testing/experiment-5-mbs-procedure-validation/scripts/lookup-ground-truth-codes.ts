#!/usr/bin/env tsx

/**
 * Script to look up ground truth MBS codes for test entities
 *
 * Searches the regional_medical_codes table to find correct MBS codes
 * for each of the 35 procedure entities.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Entity {
  id: number;
  entity_text: string;
  category: string;
  subcategory: string;
  expected_mbs_code: string;
  expected_mbs_display: string;
  notes: string;
  variations?: string[];
  formatting_test?: string;
}

interface TestData {
  metadata: any;
  entities: Entity[];
  special_test_groups?: any;
}

// Manual search queries for common procedures
const SEARCH_QUERIES: Record<number, string[]> = {
  1: ['standard', 'consultation', 'gp', 'level b', 'level c'],
  2: ['long', 'consultation', 'extended', 'level d'],
  3: ['telehealth', 'telephone', 'video'],
  4: ['ecg', 'electrocardiogram', 'tracing'],
  5: ['spirometry', 'lung function'],
  6: ['wound', 'dressing'],
  7: ['suture', 'removal'],
  8: ['ear', 'syringing', 'irrigation'],
  9: ['influenza', 'vaccination', 'immunisation'],
  10: ['skin', 'lesion', 'excision'],
  11: ['mental health', 'care plan'],
  12: ['pap', 'smear', 'cervical'],
  13: ['joint', 'injection', 'intra-articular'],
  14: ['blood', 'collection', 'venipuncture'],
  15: ['chest', 'x-ray', 'radiograph'],
  16: ['chest', 'x-ray', 'radiograph'],
  17: ['chest', 'x-ray', 'radiograph'],
  18: ['chest', 'x-ray', 'radiograph'],
  19: ['chest', 'x-ray', 'radiograph'],
  20: ['ankle', 'x-ray', 'radiograph'],
  21: ['ct', 'head', 'brain'],
  22: ['ultrasound', 'abdomen'],
  23: ['laceration', 'repair', 'suture'],
  24: ['appendectomy', 'appendix'],
  25: ['cholecystectomy', 'gallbladder'],
  26: ['hernia', 'repair', 'inguinal'],
  27: ['knee', 'arthroscopy'],
  28: ['hip', 'replacement', 'arthroplasty'],
  29: ['carpal tunnel', 'release'],
  30: ['tonsillectomy', 'tonsil'],
  31: ['cataract'],
  32: ['hysterectomy', 'uterus'],
  33: ['caesarean', 'c-section'],
  34: ['colonoscopy'],
  35: ['skin cancer', 'melanoma', 'excision']
};

async function searchMBSCode(entityId: number, keywords: string[]): Promise<any[]> {
  console.log(`\nSearching for entity ${entityId} with keywords: ${keywords.join(', ')}`);

  // Try combined keyword search
  const searchPattern = `%${keywords.join('%')}%`;

  const { data, error } = await supabase
    .from('regional_medical_codes')
    .select('code_value, display_name, normalized_embedding_text')
    .eq('code_system', 'mbs')
    .ilike('normalized_embedding_text', searchPattern)
    .limit(5);

  if (error) {
    console.error(`Error searching for entity ${entityId}:`, error);
    return [];
  }

  if (!data || data.length === 0) {
    // Try individual keyword searches
    console.log('  No results with combined keywords, trying individual searches...');

    for (const keyword of keywords) {
      const { data: individualData, error: individualError } = await supabase
        .from('regional_medical_codes')
        .select('code_value, display_name, normalized_embedding_text')
        .eq('code_system', 'mbs')
        .ilike('normalized_embedding_text', `%${keyword}%`)
        .limit(5);

      if (individualData && individualData.length > 0) {
        console.log(`  Found ${individualData.length} results for keyword: ${keyword}`);
        return individualData;
      }
    }

    console.log('  No results found');
    return [];
  }

  console.log(`  Found ${data.length} results`);
  return data;
}

async function main() {
  console.log('================================================================================');
  console.log('MBS CODE GROUND TRUTH LOOKUP');
  console.log('================================================================================\n');

  // Load test data
  const testDataPath = path.join(__dirname, '../test-data/realistic-procedure-entities.json');
  const testData: TestData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

  console.log(`Loaded ${testData.entities.length} test entities\n`);

  const results: Record<number, any> = {};

  // Search for each entity
  for (const entity of testData.entities) {
    const keywords = SEARCH_QUERIES[entity.id] || [entity.entity_text.toLowerCase()];
    const mbsCodes = await searchMBSCode(entity.id, keywords);

    results[entity.id] = {
      entity_text: entity.entity_text,
      category: entity.category,
      candidates: mbsCodes,
      status: mbsCodes.length > 0 ? 'FOUND' : 'NOT_FOUND'
    };

    // Display results
    if (mbsCodes.length > 0) {
      console.log(`  ✓ Top match: ${mbsCodes[0].code_value} - ${mbsCodes[0].display_name.substring(0, 80)}...`);
    } else {
      console.log(`  ✗ No match found`);
    }

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Save results
  const outputPath = path.join(__dirname, '../test-data/ground-truth-lookup-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log('\n================================================================================');
  console.log('SUMMARY');
  console.log('================================================================================\n');

  const found = Object.values(results).filter(r => r.status === 'FOUND').length;
  const notFound = Object.values(results).filter(r => r.status === 'NOT_FOUND').length;

  console.log(`Found: ${found}/${testData.entities.length}`);
  console.log(`Not Found: ${notFound}/${testData.entities.length}`);
  console.log(`\nResults saved to: ${outputPath}`);

  console.log('\n================================================================================\n');
}

main().catch(console.error);
