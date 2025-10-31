# Multi-Format Medical Document De-identification: Feasibility Analysis

**Research Date:** October 31, 2025
**Purpose:** Evaluate expanding de-identification from XML to all medical file formats (PDF, JPEG, DICOM, etc.)
**Use Case:** Standalone website for beta testers to de-identify their own medical records

---

## Executive Summary

**FEASIBILITY: HIGH** - Expanding to multiple file formats is absolutely possible and already being done by commercial vendors and open-source projects. However, there are significant technical challenges and compliance considerations.

---

## Current Market Solutions (2024-2025)

### Commercial Platforms

1. **John Snow Labs**
   - **Formats:** PDF, DICOM images, SVS slides, FHIR, tabular data, unstructured text
   - **Technology:** Spark NLP + Spark OCR models
   - **Compliance:** HIPAA-compliant out-of-the-box
   - **Approach:** Automated NLP + OCR with masking/redaction
   - **Website:** https://www.johnsnowlabs.com/deidentification/

2. **Shaip**
   - **Formats:** PDF, images, structured/unstructured documents
   - **Compliance:** HIPAA, GDPR, custom requirements
   - **Approach:** Automated anonymization with customization
   - **Website:** https://www.shaip.com/offerings/data-deidentification/

3. **iMerit**
   - **Formats:** Medical images, videos, structured data
   - **Approach:** AI + Human-in-the-loop for HIPAA compliance
   - **Case Study:** Successfully de-identified 20,000 ultrasound videos
   - **Website:** https://imerit.net/medical-data-de-identification-ai-phi-removal-automation/

4. **Dicom Systems Unifier**
   - **Formats:** DICOM, XML, TIFF, JPEG, PDF, other image formats
   - **Compliance:** HIPAA Safe Harbor de-identification
   - **Website:** https://dcmsys.com/project/de-identification-in-medical-imaging/

5. **CaseGuard**
   - **Formats:** PDF, emails, scanned documents
   - **Speed:** 10x faster than Adobe
   - **Approach:** Automated redaction with compliance tracking
   - **Website:** https://caseguard.com/use-cases/healthcare/

### Cloud-Based Solutions

1. **Amazon Comprehend Medical + Rekognition**
   - **Formats:** PNG, JPG, DICOM images
   - **Technology:** Computer vision + NLP for text-in-image detection
   - **Approach:** Detect, identify, and redact PHI from medical images
   - **Pricing:** Pay-per-use model

2. **Databricks Healthcare**
   - **Formats:** Various healthcare data formats
   - **Technology:** Natural Language Processing pipelines
   - **Approach:** Automated PHI removal at scale

### Open-Source Tools

1. **Microsoft Presidio** ⭐ MOST RELEVANT
   - **Formats:** Text, structured data, images (via Image Redactor)
   - **DICOM Support:** DicomImageRedactorEngine class for medical images
   - **Technology:** NLP + computer vision
   - **License:** Open-source (MIT)
   - **Website:** https://microsoft.github.io/presidio/
   - **GitHub:** https://github.com/microsoft/presidio

2. **CRATE (Clinical Records Anonymisation and Text Extraction)**
   - **Formats:** Relational databases, clinical text
   - **Features:** Full-text indexing, consent-to-contact process
   - **License:** Open-source
   - **Source:** BMC Medical Informatics and Decision Making (2017)

3. **NLM-Scrubber**
   - **Formats:** Clinical text
   - **Source:** National Library of Medicine
   - **Compliance:** HIPAA-compliant
   - **Technology:** Natural language processing
   - **Availability:** Freely available

4. **DicomCleaner**
   - **Formats:** DICOM images
   - **Features:** User interface for DICOM header editing
   - **License:** Open-source

---

## Technical Approaches by File Format

### 1. PDF Documents

**Two-Phase Process:**

**Phase 1: Text Extraction**
- OCR for scanned PDFs (Tesseract, Google Cloud Vision, AWS Textract)
- Text layer extraction for digital PDFs

**Phase 2: De-identification**
- NLP entity recognition (NER) to identify PHI
- Pattern matching for structured identifiers (MRN, SSN, etc.)
- Coordinate-based redaction or text replacement
- Re-rendering to clean PDF

**Technology Stack:**
- **OCR:** Tesseract OCR, Google Cloud Vision, AWS Textract
- **NLP:** Spark NLP, spaCy, Microsoft Presidio
- **PDF Manipulation:** PyPDF2, PDFBox, pdf-lib
- **Rendering:** Puppeteer, wkhtmltopdf, ReportLab

**Challenges:**
- Scanned PDFs require high-quality OCR
- Complex layouts (tables, multi-column) need layout analysis
- Burned-in text harder to redact cleanly
- Preserving formatting while redacting

### 2. JPEG/PNG Images (Scanned Documents)

**Process:**
1. **OCR Text Extraction:** Extract all text from image
2. **Entity Detection:** Identify PHI entities via NLP
3. **Coordinate Mapping:** Map PHI text to pixel coordinates
4. **Visual Redaction:** Black boxes, blur, or white overlay
5. **Re-export:** Save redacted image

**Technology Stack:**
- **OCR:** Tesseract, Google Cloud Vision, Azure Computer Vision
- **NLP:** Microsoft Presidio, John Snow Labs NLP
- **Image Processing:** OpenCV, Pillow (PIL), ImageMagick
- **Text Detection:** EAST text detector, CRAFT

**Challenges:**
- Handwritten text difficult to OCR
- Poor image quality reduces OCR accuracy
- Burned-in annotations, stamps, signatures
- Preserving image quality while redacting

### 3. DICOM Medical Images

**Two-Component De-identification:**

**Component 1: DICOM Header Metadata**
- Contains structured patient data (name, DOB, MRN, etc.)
- Standard DICOM tags defined in specification
- Easy to programmatically remove/replace

**Component 2: Pixel/Voxel Data**
- Burned-in PHI (especially ultrasound, secondary captures)
- Face regions in CT/MRI scans
- Text annotations on images
- Requires computer vision + OCR

**Technology Stack:**
- **DICOM Handling:** pydicom, dcm4che, DCMTK
- **Anonymization:** DicomCleaner, CTP DICOM Anonymizer
- **Face Detection:** OpenCV, dlib, face_recognition
- **OCR on Images:** Tesseract + Presidio

**Challenges:**
- Burned-in PHI requires human verification
- 3D imaging volumes are computationally intensive
- Face de-identification in CT/MRI (privacy vs clinical utility)
- DICOM standard has 100+ tags to consider

### 4. FHIR Resources (JSON/XML)

**Process:**
- Similar to our current XML approach
- Parse JSON/XML structure
- Replace identifiers in structured fields
- Preserve clinical data relationships

**Technology Stack:**
- **FHIR Libraries:** HAPI FHIR, fhir.js
- **De-identification:** Field-level replacement similar to our sed approach
- **Validation:** FHIR validators to ensure compliance

**Challenges:**
- Complex nested structures
- References between resources must be consistent
- Maintaining referential integrity

---

## Key Technical Challenges

### 1. Burned-In PHI (Biggest Challenge)

**Definition:** Patient information embedded as pixels in images (not metadata)

**Common Sources:**
- Ultrasound images (machine overlays patient name/DOB)
- Scanned paper records
- Screenshots from EHR systems
- Secondary captures from imaging workstations
- Annotations added by clinicians

**Detection Methods:**
- OCR entire image
- Pattern matching for PHI formats (dates, MRNs, names)
- Computer vision to detect text regions

**Redaction Methods:**
- Black box overlay
- Gaussian blur
- Inpainting (smart fill)
- White rectangle

**Limitation:** Requires human verification for clinical accuracy

### 2. OCR Accuracy

**Challenges:**
- Handwritten notes (60-80% accuracy)
- Poor scan quality
- Multi-column layouts
- Tables and complex formatting
- Medical abbreviations and jargon

**Solutions:**
- Multiple OCR engines (ensemble approach)
- Pre-processing (deskewing, contrast enhancement, noise reduction)
- Post-processing (spell check, medical dictionary validation)
- Human-in-the-loop for low-confidence results

### 3. Context-Aware De-identification

**Problem:** Same text string may or may not be PHI depending on context

**Examples:**
- "Washington" - city name (keep) vs. "Washington Hospital" (potentially identifiable)
- "Michael" - common word (keep) vs. "Dr. Michael Smith" (redact)
- Dates - clinical dates (keep) vs. admission dates (context-dependent)

**Solutions:**
- NLP entity recognition with context
- Medical NER models trained on clinical text
- Rule-based heuristics for healthcare-specific patterns

### 4. Performance at Scale

**Requirements for Beta Testing Website:**
- Process documents in seconds/minutes (not hours)
- Handle concurrent users
- Support large files (100+ page documents, high-res images)

**Solutions:**
- Cloud-based processing (AWS Lambda, Google Cloud Functions)
- Parallel processing for multi-page documents
- Client-side preprocessing (compress, resize)
- Progressive results (show page-by-page)

### 5. Compliance & Accuracy

**HIPAA Safe Harbor Requirements:** Remove all 18 identifiers

**Accuracy Metrics:**
- **Precision:** % of redacted text that is actually PHI (avoid over-redaction)
- **Recall:** % of PHI that gets detected (avoid under-redaction)
- **Target:** >95% precision, >99% recall for HIPAA compliance

**Challenge:** Medical documents are complex - achieving 99%+ recall is difficult

**Human-in-the-Loop:**
- Commercial vendors use hybrid approach
- AI does initial pass, humans verify
- Critical for legal compliance

---

## Recommended Technology Stack for Your Use Case

### Phase 1: Proof of Concept (Current + PDF)

**Goal:** Extend current XML approach to handle PDFs

**Stack:**
1. **OCR:** Google Cloud Vision API (excellent accuracy, reasonable cost)
2. **Text Extraction:** pdf-lib (JavaScript) or PyPDF2 (Python)
3. **De-identification:** Extend current sed/regex approach
4. **Rendering:** Puppeteer (already have it for XML→PDF)

**Why This Works:**
- Minimal new dependencies
- Leverages existing Puppeteer infrastructure
- Google Cloud Vision has medical document optimization
- Can process both digital and scanned PDFs

### Phase 2: Production-Ready Website

**Goal:** Standalone website for beta testers

**Recommended Stack:**

**Frontend:**
- Next.js (already using)
- File upload with drag-and-drop
- Client-side file preview
- Real-time processing status

**Backend:**
- Supabase Edge Functions (already integrated)
- Or AWS Lambda for heavier processing
- Queue system for batch jobs

**De-identification Engine:**
- **Option 1 (Open-Source):** Microsoft Presidio
  - Free, open-source
  - Multi-format support
  - Active development
  - Python-based (need to wrap in API)

- **Option 2 (Commercial API):** John Snow Labs
  - Pay-per-use pricing
  - Production-ready
  - High accuracy
  - Less development effort

**File Processing Pipeline:**
```
User Upload → File Type Detection → Format-Specific Processing → De-identification → PDF Conversion → Download
```

**Supported Formats (Priority Order):**
1. **XML** (already working)
2. **PDF** (scanned + digital)
3. **JPEG/PNG** (scanned documents)
4. **DICOM** (medical images) - optional, complex

### Phase 3: Advanced Features

1. **Batch Processing:** Upload multiple files, maintain patient context
2. **Smart Replacement:** Consistent dummy names across documents
3. **Preview Mode:** Show before/after comparison
4. **Confidence Scores:** Highlight low-confidence redactions for manual review
5. **Export Options:** PDF, redacted images, structured data

---

## Cost Analysis

### OCR Costs (Google Cloud Vision)

**Pricing (as of 2025):**
- Text Detection: $1.50 per 1,000 images
- Document Text Detection: $2.00 per 1,000 pages

**Example:**
- 100 users × 10 documents each = 1,000 documents
- Cost: $2.00-$3.00 total (incredibly cheap)

### Storage Costs (Supabase)

**Pricing:**
- 1 GB storage included in free tier
- $0.021 per GB per month after that

**Example:**
- 1,000 documents × 2 MB average = 2 GB
- Cost: ~$0.05/month (negligible)

### Compute Costs

**Supabase Edge Functions:**
- 2M invocations free per month
- $2.00 per 1M invocations after that

**Example:**
- 1,000 documents requiring 5 function calls each = 5,000 invocations
- Cost: $0 (well within free tier)

### Total Estimated Cost for Beta (100 users)

**Monthly:**
- OCR: $10-20
- Storage: $1-5
- Compute: $0-10
- **Total: $11-35/month**

**Per Document:**
- $0.01-0.03 per document

**Very affordable for beta testing!**

---

## Limitations & Obstacles

### Critical Limitations

1. **Burned-In PHI Requires Human Review**
   - Cannot guarantee 100% automated accuracy
   - Medical-legal liability concerns
   - Need disclaimer: "For testing purposes only"

2. **Handwritten Text**
   - OCR accuracy 60-80%
   - May miss handwritten names, notes
   - Requires manual review or exclusion

3. **Complex Medical Images**
   - CT/MRI face de-identification is complex
   - May degrade diagnostic utility
   - Requires medical expertise to verify

4. **Legal Liability**
   - If PHI leaks due to incomplete de-identification
   - Need strong terms of service
   - Consider human-in-the-loop verification

### Practical Obstacles

1. **Processing Time**
   - Large PDF (50+ pages) may take 30-60 seconds
   - DICOM volumes may take minutes
   - Need to set user expectations

2. **File Size Limits**
   - Browser upload limits (typically 100 MB)
   - Server processing memory limits
   - May need chunking for large files

3. **Format Variations**
   - Thousands of EHR systems with different exports
   - Non-standard PDF formats
   - Legacy file formats

4. **User Experience**
   - Need clear instructions
   - Show confidence scores
   - Allow manual override/editing

### Compliance Obstacles

1. **HIPAA Compliance**
   - Even de-identified data requires secure handling
   - Need Business Associate Agreement if processing for others
   - Encryption in transit and at rest

2. **Australian Privacy Act**
   - Additional requirements for AU users
   - Cross-border data transfer considerations

3. **Data Retention**
   - How long to keep uploaded files?
   - Automatic deletion after processing?
   - Audit trail requirements

---

## Recommended Implementation Roadmap

### Phase 0: Current State (COMPLETED)
- ✅ XML de-identification working
- ✅ XML → PDF conversion working
- ✅ Manual sed-based approach

### Phase 1: PDF Support (2-3 weeks)
**Milestone:** Extend to handle PDF uploads

**Tasks:**
1. Integrate Google Cloud Vision OCR
2. Extract text from PDFs (digital + scanned)
3. Apply current de-identification logic
4. Generate redacted PDF output
5. Test with sample PDFs

**Deliverable:** Working PDF de-identification

### Phase 2: Web Interface (2-3 weeks)
**Milestone:** Standalone website for file upload

**Tasks:**
1. Build Next.js upload interface
2. Supabase Edge Function for processing
3. Queue system for async processing
4. Download redacted files
5. Basic error handling

**Deliverable:** Beta website for testers

### Phase 3: Enhanced Accuracy (Ongoing)
**Milestone:** Improve detection rates

**Tasks:**
1. Integrate Microsoft Presidio NLP
2. Add confidence scoring
3. Manual review interface
4. Batch processing support
5. Performance optimization

**Deliverable:** Production-ready system

### Phase 4: Multi-Format Support (Future)
**Milestone:** Support JPEG, DICOM, etc.

**Tasks:**
1. Image de-identification pipeline
2. DICOM header anonymization
3. Format conversion tools
4. Advanced redaction techniques

**Deliverable:** Comprehensive solution

---

## Competitive Analysis

### What Makes Your Solution Unique?

**Existing Solutions:**
- Commercial tools are expensive ($500-5,000/month)
- Open-source tools require technical expertise
- No simple "upload and go" solutions for patients

**Your Advantage:**
- **Free for beta testers** (low-cost at scale)
- **Simple web interface** (no technical knowledge needed)
- **Patient-centric** (designed for individuals, not institutions)
- **Integrated with Exora** (seamless upload to health records)
- **Open-source approach** (trustworthy, auditable)

**Market Gap:** There's no consumer-friendly medical record de-identification tool. Everything is enterprise-focused.

---

## Conclusion & Recommendation

### Is It Possible?
**YES** - Absolutely possible and actively being done by commercial vendors.

### Is It Practical for Your Use Case?
**YES** - With caveats:

**✅ Pros:**
- Low cost ($0.01-0.03 per document)
- Existing technology stack (Supabase, Next.js, Puppeteer)
- Clear roadmap from XML → PDF → Images
- Strong market need (no consumer solutions exist)

**⚠️ Cons:**
- Cannot guarantee 100% accuracy (need disclaimer)
- Burned-in PHI requires human review
- Legal liability considerations
- Ongoing maintenance as EHR formats evolve

### Recommended Approach

**Start Small:**
1. **Extend current XML solution to PDF** (Phase 1)
2. **Build simple web interface** (Phase 2)
3. **Beta test with controlled group** (your friends)
4. **Gather feedback and iterate**
5. **Expand formats based on user demand**

**Key Success Factors:**
- **Clear disclaimers:** "For testing purposes only, not certified for clinical use"
- **Transparency:** Show confidence scores, allow manual review
- **Privacy-first:** Process files client-side when possible, auto-delete uploads
- **Start with structured formats:** XML, PDF (easier than images)

### Next Steps

1. ✅ **Organize sample medical records** (current task)
2. **Integrate Google Cloud Vision** for PDF OCR
3. **Extend de-identification script** to handle OCR output
4. **Build proof-of-concept web interface**
5. **Test with your friends' data**
6. **Iterate based on real-world feedback**

---

## References

**Commercial Solutions:**
- John Snow Labs: https://www.johnsnowlabs.com/deidentification/
- Shaip: https://www.shaip.com/offerings/data-deidentification/
- iMerit: https://imerit.net/medical-data-de-identification-ai-phi-removal-automation/
- Dicom Systems: https://dcmsys.com/project/de-identification-in-medical-imaging/

**Open-Source Tools:**
- Microsoft Presidio: https://microsoft.github.io/presidio/
- CRATE: https://bmcmedinformdecismak.biomedcentral.com/articles/10.1186/s12911-017-0437-1

**Compliance:**
- HIPAA De-identification: https://www.hhs.gov/hipaa/for-professionals/special-topics/de-identification/index.html
- HHS Guidance (2025): https://www.hipaajournal.com/de-identification-protected-health-information/

**Technical Resources:**
- AWS Medical Image De-identification: https://aws.amazon.com/blogs/machine-learning/de-identify-medical-images-with-the-help-of-amazon-comprehend-medical-and-amazon-rekognition/
- DICOM De-identification: https://pmc.ncbi.nlm.nih.gov/articles/PMC9141493/

---

**Report Generated:** October 31, 2025
**Author:** Claude (Anthropic) via Exora Health Development
**Status:** Research Complete - Ready for Implementation Planning
