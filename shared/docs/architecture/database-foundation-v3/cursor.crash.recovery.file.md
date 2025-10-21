Key Discovery!

  Answer to your question: NO, brand names do NOT have their own unique PBS codes.

  The PBS Structure:

  1. pbs_code: Same for all brands of the same medication (e.g., "10004M")
  2. li_item_id: Unique identifier that includes brand-specific info (e.g., "10004M_7501_1327_5783_52398"
   vs "10004M_7501_1327_5783_7045")
  3. brand_name: Different for each variant (e.g., "Sutent" vs "Sunitinib Sandoz")

  Examples from the data:

  Sunitinib (10004M):
  - Sutent (originator brand)
  - Sunitinib Sandoz (generic)
  - Both share PBS code "10004M"

  Olmesartan combo (10005N):
  - Sevikar HCT 20/5/12.5 (originator)
  - Olamlo HCT 20/5/12.5 (generic)
  - APO-Olmesartan/Amlodipine/HCTZ 20/5/12.5 (generic)
  - All share PBS code "10005N"

  Erlotinib (10014C):
  - Erlotinib Sandoz
  - Erlotinib APOTEX
  - ERLOTINIB ARX
  - All share PBS code "10014C"

  Critical Implications:

  1. If we deduplicate by PBS code, we lose brand information completely
  2. PBS code alone cannot distinguish between brands
  3. The li_item_id is the true unique identifier with brand specificity

  Revised Understanding:

  My current parser is using pbs_code as the deduplication key, which is WRONG for preserving brand
  information. We should either:

  Option A: Use li_item_id as unique key
  // This preserves ALL brand variants
  const key = row.li_item_id; // "10004M_7501_1327_5783_52398"

  Option B: Keep pbs_code but aggregate brands
  // This groups brands under one PBS code
  const key = row.pbs_code; // "10004M"
  // But collect all brand_names in an array

  My Updated Recommendation:

  Use li_item_id as the unique identifier to preserve all brand variants. This means:

  1. No deduplication needed - each row in items.csv is unique
  2. All brands preserved - Better for matching patient uploads
  3. Group by pbs_code when you want deduplicated display
  4. The database will have more records (~5,000+ instead of ~3,000) but this is actually the correct
  representation

  Would you like me to update the parser to:
  1. Use li_item_id as the unique key
  2. Remove the deduplication logic entirely
  3. Keep both li_item_id and pbs_code for flexible grouping later?

> /model 
  ⎿  Set model to Default (Sonnet 4.5 · Smartest model for daily use)

> Yes i lik eyour Updated Recommendation to Use li_item_id but we will also store nad have the pbs file 
to yes? 

⏺ Yes, exactly! We'll store both li_item_id AND pbs_code in each record.

  Updated Data Structure:

  {
    "code_system": "pbs",
    "code_value": "10004M_7501_1327_5783_52398",  // li_item_id (unique)
    "pbs_code": "10004M",                          // PBS code (for grouping)
    "display_name": "Sunitinib Capsule 12.5 mg",
    "entity_type": "medication",
    "search_text": "Sunitinib Capsule 12.5 mg Sutent",
    "library_version": "v2025Q4",
    "country_code": "AUS",
    "region_specific_data": {
      "brand_name": "Sutent",
      "li_item_id": "10004M_7501_1327_5783_52398",  // Also here for reference
      "pbs_code": "10004M",                         // Also here for reference
      "li_form": "Capsule 12.5 mg",
      // ... other fields
    }
  }

  Benefits:

  1. ✅ Unique identification: code_value = li_item_id (truly unique)
  2. ✅ Grouping capability: pbs_code lets us group all brands of same medication
  3. ✅ Vector search: Each brand variant gets its own embedding
  4. ✅ Frontend flexibility: Can show grouped or ungrouped views
  5. ✅ No information loss: All brand variants preserved

  Usage Scenarios:

  Scenario 1: User uploads "Sutent"
  - Vector search matches → li_item_id: 10004M_7501_1327_5783_7045 (Sutent)
  - Display: "Sunitinib Capsule 12.5 mg (Sutent)"

  Scenario 2: Frontend wants to deduplicate current meds
  // Group by pbs_code to show one medication per active ingredient
  SELECT DISTINCT ON (pbs_code) *
  FROM current_medications
  ORDER BY pbs_code, date_started DESC;

  Scenario 3: Frontend wants full history with all brands
  // Show all brand switches over time
  SELECT * FROM medication_history
  WHERE pbs_code = '10004M'
  ORDER BY date_started;

  Shall I update the parser code to implement this?

> And will this system work for the universal code libraries (pbs is just aus regional) - im still 
waiting on access to uinversal code lirvaryes so dont have them yet.  As we are building an app for all 
users from all countries, the medical code libaries are interchanble for the regional medical code 
libaries so we need to ensure we're building generic with plug in medical code libraries dependent on 
region. When we add a new regional medical code library we cna of course tailor it to the db schema etc 

⏺ Excellent strategic question! Let me analyze whether this approach scales to universal code libraries
  and the multi-region architecture.

  Universal Code Libraries Structure

  Let me check the parsing strategy to understand the universal code structure:

⏺ Read(shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medi
      cal-code-embedding/code-data-preparation/PARSING-STRATEGY.md)
  ⎿  Read 60 lines

⏺ Perfect! Now I understand the universal libraries structure. Let me analyze:

  Answer: YES, the system will work for universal libraries!

  Universal Libraries Don't Have Brand Variants

  RxNorm:
  - code_value: RXCUI (unique concept ID) - e.g., "205923"
  - NO brand variants at this level
  - Each RXCUI is already unique
  - Brand info: Different RXCUIs for branded vs generic (SCD vs SBD)

  SNOMED-CT:
  - code_value: Concept ID - e.g., "22298006"
  - NO brand variants
  - Each concept ID is unique
  - Pure clinical terminology (not product-specific)

  LOINC:
  - code_value: LOINC_NUM - e.g., "85354-9"
  - NO brand variants
  - Lab tests/observations (brand doesn't apply)

  The Pattern Works Universally!

  | Library Type       | Unique ID Field | Grouping Field | Has Brands?                     |
  |--------------------|-----------------|----------------|---------------------------------|
  | PBS (AUS)          | li_item_id      | pbs_code       | ✅ YES                           |
  | RxNorm (Universal) | rxcui           | N/A            | ❌ NO (but has SCD/SBD variants) |
  | SNOMED (Universal) | conceptId       | N/A            | ❌ NO                            |
  | LOINC (Universal)  | LOINC_NUM       | N/A            | ❌ NO                            |
  | MBS (AUS)          | Item            | N/A            | ❌ NO                            |
  | ICD-10-AM (AUS)    | Code            | N/A            | ❌ NO                            |

  Unified Parsing Strategy:

  interface MedicalCodeStandard {
    code_system: 'rxnorm' | 'snomed' | 'loinc' | 'pbs' | 'mbs' | 'icd10_am';
    code_value: string;  // ALWAYS the unique ID (li_item_id, rxcui, conceptId, etc.)

    // OPTIONAL: Only for libraries with grouping (like PBS)
    grouping_code?: string;  // pbs_code for PBS, null for others

    display_name: string;
    entity_type: 'medication' | 'condition' | 'procedure' | 'observation' | 'allergy';
    search_text: string;
    library_version: string;
    country_code: string | null;  // null for universal, 'AUS' for regional
    region_specific_data: Record<string, any>;
  }

  Parser Implementation by Library:

  PBS (Australia - has brands):
  {
    code_system: 'pbs',
    code_value: '10004M_7501_1327_5783_7045',  // li_item_id (unique per brand)
    grouping_code: '10004M',                    // pbs_code (groups brands)
    brand_name: 'Sutent',
    country_code: 'AUS'
  }

  RxNorm (Universal - no brands, but SCD/SBD):
  {
    code_system: 'rxnorm',
    code_value: '205923',  // RXCUI (already unique)
    grouping_code: null,   // No grouping needed
    country_code: null
  }

  UK/USA Regional Libraries (Future):
  // UK - BNF (British National Formulary)
  {
    code_system: 'bnf_uk',
    code_value: 'BNF_123_456_789',  // Unique BNF code
    grouping_code: 'BNF_123',        // If BNF has brand variants
    country_code: 'GBR'
  }

  // USA - NDC (National Drug Code)
  {
    code_system: 'ndc_usa',
    code_value: '12345-678-90',  // NDC (product-specific, includes brand)
    grouping_code: null,          // NDC is already product-specific
    country_code: 'USA'
  }

  Plugin Architecture:

  1. Database Schema (Already Supports This!)

  Your database has:
  - universal_medical_codes table (country_code = null)
  - regional_medical_codes table (country_code = 'AUS', 'USA', 'GBR', etc.)

  2. User Profile Configuration

  interface UserProfile {
    user_id: string;
    primary_country: 'AUS' | 'USA' | 'GBR' | 'CAN' | ...;
    enabled_libraries: string[];  // ['rxnorm', 'snomed', 'loinc', 'pbs', 'mbs']
  }

  3. Pass 2 Matching Logic (Library Selection)

  async function matchMedication(extractedEntity: string, userProfile: UserProfile) {
    // Build library filter based on user's country
    const libraries = [
      ...UNIVERSAL_LIBRARIES,  // Always include: rxnorm, snomed, loinc
      ...getRegionalLibraries(userProfile.primary_country)  // Add: pbs, mbs for AUS
    ];

    // Vector search across selected libraries only
    const matches = await vectorSearch(extractedEntity, {
      filter: { code_system: { $in: libraries } }
    });

    return matches;
  }

  4. Adding New Regional Libraries (Future)

  Step 1: Download new library (e.g., NHS UK - SNOMED UK extension)
  Step 2: Write parser following MedicalCodeStandard interface
  Step 3: Run parser → Generate embeddings → Populate database
  Step 4: Update code_system enum to include new library
  Step 5: Configure user profiles to enable new library

  Multi-Region Example:

  Australian user uploads: "Taking Panadol"
  - Searches: PBS (regional) + RxNorm (universal) + SNOMED (universal)
  - Matches: PBS code for paracetamol + RxNorm acetaminophen concepts

  UK user uploads: "Taking Paracetamol"
  - Searches: BNF (regional UK) + RxNorm (universal) + SNOMED (universal)
  - Matches: BNF codes + RxNorm concepts

  USA user uploads: "Taking Tylenol"
  - Searches: NDC (regional USA) + RxNorm (universal) + SNOMED (universal)
  - Matches: NDC codes + RxNorm concepts

  Summary:

  ✅ YES - The li_item_id + pbs_code pattern is PBS-specific
  ✅ YES - Universal libraries work with simpler structure (just code_value)
  ✅ YES - System is plug-and-play for new regional libraries
  ✅ YES - MedicalCodeStandard interface supports both (grouping_code optional)

  The PBS parser needs li_item_id because PBS has brand variants. Universal libraries (RxNorm, SNOMED,
  LOINC) don't have this complexity, so they just use their native unique IDs.

  Shall I update the parser to use li_item_id as the unique code_value and add optional grouping_code 
  field for PBS?

  Todos
  ☒ Implement PBS parser (parse-pbs.ts)
  ☒ Test PBS parser with sample data
  ☐ Run PBS parser on full dataset
  ☐ Implement MBS parser (parse-mbs.ts)
  ☐ Test MBS parser with sample data
  ☐ Run MBS parser on full dataset
  ☐ Run embeddings generation for PBS
  ☐ Run embeddings generation for MBS
  ☐ Populate database with PBS codes (dry-run)
  ☐ Populate database with MBS codes (dry-run)
  ☐ USER: Check UMLS account approval status
  ☐ USER: Download RxNorm from UMLS after approval
  ☐ USER: Download SNOMED-CT from UMLS after approval
  ☐ USER: Download LOINC from UMLS after approval





  ---



   so universal codes do not take into account branding?? why, this seems bad, are you sure? 

⏺ You're absolutely right to question this! Let me investigate deeper into how universal libraries handle
   brands.

  Let me check RxNorm's brand handling:

⏺ Read(shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-medi
      cal-code-embedding/code-data-preparation/PARSING-STRATEGY.md)
  ⎿  Read 50 lines

⏺ WAIT! You're absolutely right - I see it now in line 102:

  // Filter: Only include SCD (Semantic Clinical Drug) and SBD (Semantic Branded Drug)
  if (!['SCD', 'SBD'].includes(tty)) {
    return null;
  }

  RxNorm DOES Handle Brands!

  TTY (Term Type) codes:
  - SCD = Semantic Clinical Drug (generic) - e.g., "Atorvastatin 20 MG Oral Tablet"
  - SBD = Semantic Branded Drug (brand name) - e.g., "Lipitor 20 MG Oral Tablet"

  So RxNorm HAS THE SAME ISSUE AS PBS!

  Different RXCUIs for:
  - Generic: RXCUI 205923 = "Atorvastatin 20 MG Oral Tablet" (SCD)
  - Brand: RXCUI 617318 = "Lipitor 20 MG Oral Tablet" (SBD)

  Each brand gets its own unique RXCUI - just like PBS has different li_item_id for each brand!

  Critical Realization:

  RxNorm structure:
  - Different RXCUI for generic vs branded
  - NO grouping code to link them together
  - We SHOULD include both SCD and SBD to capture brand names

  This means we need BOTH:
  1. Generic entries (SCD): "Atorvastatin 20 MG Oral Tablet"
  2. Branded entries (SBD): "Lipitor 20 MG Oral Tablet", "Caduet 5/10 MG Oral Tablet"

  Updated Understanding:

  The parsing strategy document is CORRECT - we should include both SCD and SBD term types. This will
  give us ~50,000 medications including both generic and branded versions.

  Similar to PBS:
  - PBS: Multiple li_item_id values per pbs_code (brand variants)
  - RxNorm: Multiple RXCUIs (separate for SCD and SBD)

  Key difference:
  - PBS explicitly groups brands under one pbs_code
  - RxNorm doesn't have a grouping field - each RXCUI is independent

  This means for RxNorm we should:

  1. Include both SCD and SBD (generic + branded)
  2. Each gets unique RXCUI as code_value
  3. Store TTY (term type) in region_specific_data to distinguish generic/brand
  4. No grouping field needed - RXCUIs are independent

  You were right to question this! Universal libraries DO handle brands, just differently than regional
  libraries. Should I research RxNorm's relationship structure to see if there's a way to link
  generic/branded versions together?

> search onmline and find the actual answer to universal medical codes and what they actually have for 
brands for meications 

 ▐▛███▜▌   Claude Code v2.0.15
▝▜█████▛▘  Sonnet 4.5 · Claude Max
  ▘▘ ▝▝    /Users/xflanagan/Documents/GitHub/Guardian-Cursor
════════════════════════════════ Conversation compacted · ctrl+o for history ════════════════════════════════
  ⎿  Read parse-pbs.ts (322 lines)
  ⎿  Read test-pbs-output.json (157 lines)
  ⎿  Read test-pbs-sample.csv (12 lines)
  ⎿  Referenced file shared/docs/PROGRESS_LOG.md
  ⎿ Read shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-planning/pass-1.5-me
    dical-code-embedding/QUICK-START-NEXT-SESSION.md (248 lines)
  ⎿  Todo list read (14 items)

⏺ I'll search online to find the actual answer about how universal medical codes handle medication
  brands.

⏺ Web Search("RxNorm SBD branded drugs medication brands how many")
  ⎿  Did 1 search in 13s                                                                                

⏺ Web Search("SNOMED CT medication brand names pharmaceutical products")
  ⎿  Did 1 search in 19s                                                                                

⏺ Web Search("RxNorm SCD vs SBD semantic clinical drug branded drug difference")
  ⎿  Did 1 search in 14s                                                                                

⏺ Perfect! Now I have the actual research results. Let me compile this into a clear analysis for the
  user.

  Research Results: Universal Medical Code Libraries and Brand Names

  Based on online research, here's what I found about how universal medical code libraries handle
  medication brands:

  RxNorm (USA) - YES, HAS BRANDS ✓

  Two distinct term types:
  - SCD (Semantic Clinical Drug): Generic medications
    - Format: Ingredient + Strength + Dose Form
    - Example: "Fluoxetine 4 MG/ML Oral Solution"
  - SBD (Semantic Branded Drug): Branded medications
    - Format: Ingredient + Strength + Dose Form + Brand Name
    - Example: "Fluoxetine 4 MG/ML Oral Solution [Prozac]"

  Scale: As of published studies, RxNorm contained:
  - ~18,604 generic (SCD) medications
  - ~14,609 branded (SBD) medications
  - Each gets a unique RXCUI (RxNorm Unique Identifier)

  Key Finding: RxNorm treats generic vs branded as completely different drugs with different codes. This
  is EXACTLY like PBS using different li_item_id values for different brands!

  SNOMED CT (International) - NO BRANDS IN INTERNATIONAL RELEASE

  Brand Name Policy:
  - International Release: Does NOT include brand names
  - National Extensions: Countries CAN add brand names in their national extensions
  - Rationale: "Brand names, formulations and strengths of active ingredient substances may all differ
  across countries"

  Structure:
  - International model has: active ingredient, presentation strength, basis of strength
  - National extensions can add: packaging information, branded products, country-specific medications

  Example: Australia could have SNOMED CT Australian Extension with brand names, but the international
  release would only have generic/ingredient-based concepts.

  LOINC - NOT APPLICABLE

  LOINC is for laboratory observations and clinical measurements (test codes), not medications. It
  doesn't deal with drug brands at all.

  ---
  Critical Insights for Our Architecture

  1. Your Instinct Was CORRECT

  Your concern about excluding brand names was spot-on. RxNorm proves that brand names ARE medically 
  significant - they get their own unique codes!

  2. PBS and RxNorm Are Architecturally Similar

  | PBS (Australia)                | RxNorm (USA)                              |
  |--------------------------------|-------------------------------------------|
  | li_item_id per brand           | RXCUI per brand (SCD vs SBD)              |
  | pbs_code for grouping          | No grouping code                          |
  | "Sunitinib Sandoz" vs "Sutent" | "Atorvastatin Tablet" vs "Lipitor Tablet" |

  3. Universal vs Regional Pattern Confirmed

  - Universal libraries (RxNorm): Include both generic AND branded as separate codes
  - International libraries (SNOMED CT): Generic only in international release, brands in national
  extensions
  - Regional libraries (PBS): Include brands specific to that country

  4. Our Parser Strategy Is Correct

  Using li_item_id (most granular identifier) is the RIGHT approach because:
  1. RxNorm does the same (unique RXCUI per brand)
  2. Preserves all brand variants for better patient upload matching
  3. Allows optional grouping via pbs_code field
  4. Matches medical practice (brands DO matter clinically)

  ---
  Updated Recommendation: CONFIRMED

  Proceed with PBS parser updates:
  1. ✅ Use li_item_id as code_value (most granular unique ID)
  2. ✅ Store pbs_code in region_specific_data for optional grouping
  3. ✅ Keep ALL brand variants (no deduplication)
  4. ✅ This matches how RxNorm handles brands (different codes for different brands)

  This will work for all future libraries:
  - RxNorm: Use RXCUI (already unique per SCD/SBD)
  - SNOMED CT International: No brand handling needed
  - SNOMED CT National Extensions: Use most granular concept ID (like li_item_id)
  - Future regional libraries: Use most granular ID available

  Should I now update the PBS parser to use li_item_id and run it on the full dataset?

> Yes proceed, but before we do that i think we need to update the relevant 
documentation with our iterated revised more informed approach. which fo these files
 need updating: 
shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-plan
ning/pass-1.5-medical-code-embedding/code-data-preparation/DATA-ACQUISITION-GUIDE.md
shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-plan
ning/pass-1.5-medical-code-embedding/code-data-preparation/data-population-scripts.m
d
shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-plan
ning/pass-1.5-medical-code-embedding/code-data-preparation/DATABASE-POPULATION-GUIDE
.md
shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-plan
ning/pass-1.5-medical-code-embedding/code-data-preparation/EMBEDDING-GENERATION-GUID
E.md
shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-plan
ning/pass-1.5-medical-code-embedding/code-data-preparation/embedding-generation-plan
.md
shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-plan
ning/pass-1.5-medical-code-embedding/code-data-preparation/generate-embeddings.ts
shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-plan
ning/pass-1.5-medical-code-embedding/code-data-preparation/PARSING-STRATEGY.md
shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-plan
ning/pass-1.5-medical-code-embedding/code-data-preparation/medical-code-sources.md 

⏺ I'll review each file to determine which need updating based on our brand name
  handling research and revised approach.

⏺ Read(shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-p
      lanning/pass-1.5-medical-code-embedding/code-data-preparation/PARSING-STRATEGY.md)
  ⎿  Read 731 lines

⏺ Read(shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-p
      lanning/pass-1.5-medical-code-embedding/code-data-preparation/medical-code-sources
      .md)
  ⎿  Read 44 lines

⏺ Read(shared/docs/architecture/database-foundation-v3/ai-processing-v3/implementation-p
      lanning/pass-1.5-medical-code-embedding/code-data-preparation/DATA-ACQUISITION-GUI
      DE.md)
  ⎿  Read 344 lines

✻ Updating PARSING-STRATEGY.md with brand name insights… (esc to interrupt)
  ⎿  ☒ Research universal medical code brand handling
     ☐ Update PARSING-STRATEGY.md with brand name insights
     ☐ Update medical-code-sources.md with brand handling
     ☐ Update PBS parser to use li_item_id
     ☐ Run PBS parser on full dataset
     ☐ Implement MBS parser (parse-mbs.ts)
     ☐ Test MBS parser with sample data
     ☐ Run MBS parser on full dataset
     ☐ Run embeddings generation for PBS
     ☐ Run embeddings generation for MBS
     ☐ Populate database with PBS codes (dry-run)
     ☐ Populate database with MBS codes (dry-run)
     ☐ USER: Check UMLS account approval status
     ☐ USER: Download RxNorm from UMLS after approval







     =========



     Current Status

  ✅ Completed:
  1. Research phase complete - Found that RxNorm DOES have brands (SBD vs SCD),
  SNOMED CT doesn't (international release), confirming our brand preservation
  approach is correct
  2. Documentation updated - All 3 key files updated with research findings and
  corrected PBS format (CSV not XML)
  3. Parser updated - parse-pbs.ts now uses li_item_id for unique brand
  identification and preserves all brand variants

  📍 Current Task:
  We're about to run the updated PBS parser on the full dataset (~3,000+
  medication records) to create the standardized JSON medical code library that
  will feed into the embedding generation process.

  What the parser will do:
  - Read: data/medical-codes/pbs/raw/2025-10-01-PBS-API-CSV-files/tables_as_csv/
  items.csv
  - Output: data/medical-codes/pbs/processed/pbs_codes.json
  - Preserve ALL brand variants (no deduplication)
  - Each record gets unique li_item_id as code_value
  - Store pbs_code for optional grouping
  - Include brand names in search text for better patient matching

  This JSON output will then be used for:
  1. Embedding generation (OpenAI text-embedding-3-small)
  2. Database population (Supabase regional_medical_codes table)
  3. Vector similarity search in Pass 1.5

  Ready to run the parser and create the PBS medical code library?

> okay, before we do, my only concern is if the resultant data file for pbs that were about to 
  create with the parser has set column titles for the codes i.e.li_item_id as code_value and 
  pbs_code for grouping, then the function scripts that eventually pull the vectors for those 
  columns will need to be tailored to every regional medical code library - hence should we rename 
  the the columns to something like specific and generic ? Because how will the worker function 
  know which column values to pull if every regional code libary has a different title equaivlent 
  for li_item_id and pbs_code - if you know what i mea

⏺ Excellent point! You're absolutely right about the architectural consistency issue. Let me think
  through this:

  The Problem

  Each regional library has different field names for the same concepts:
  - PBS: li_item_id (specific) + pbs_code (generic)
  - Future libraries:
    - NHS dm+d: AMPPID (specific) + VMPID (generic)
    - NDC: NDC_code (specific) + Generic_name (generic)
    - etc.

  The Solution Options

  Option A: Standardized Field Names (Your Suggestion)

  {
    "code_system": "pbs",
    "code_value": "10001J_14023_31078_31081_31083",  // Most specific ID
    "grouping_code": "10001J",                       // Generic grouping ID
    "display_name": "Rifaximin Tablet 550 mg",
    "region_specific_data": {
      "original_li_item_id": "10001J_14023_31078_31081_31083",
      "original_pbs_code": "10001J",
      // ... other PBS-specific fields
    }
  }

  Option B: Universal vs Specific Pattern

  {
    "code_system": "pbs",
    "code_value": "10001J_14023_31078_31081_31083",     // Always most granular
    "universal_equivalent": null,                       // RxNorm RXCUI if mapped
    "regional_grouping": "10001J",                     // Regional grouping code
    "display_name": "Rifaximin Tablet 550 mg"
  }

  Worker Function Benefits

  With standardized fields, the worker functions become library-agnostic:

  // Universal worker function
  function findSimilarCodes(patientText: string, library: MedicalCodeStandard[]) {
    // Always uses code_value (most specific) and grouping_code (for deduplication)
    const matches = vectorSearch(patientText, library.map(c => c.search_text));

    // Option to group by grouping_code if needed
    const grouped = groupBy(matches, 'grouping_code');

    return matches;
  }

  My Recommendation: Option A (Standardized Fields)

  Pros:
  - Worker functions are library-agnostic
  - Consistent API across all regional libraries
  - Original field names preserved in region_specific_data
  - Future libraries just need to map their fields to standard schema

  Cons:
  - Need to update existing documentation
  - Slightly more complex parser logic

  Should I update the parser to use grouping_code instead of storing pbs_code in
  region_specific_data?
