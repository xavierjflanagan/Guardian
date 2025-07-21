# ADR-0002: Document Intelligence Pipeline Strategy - by Gemini

**Status:** Proposed
**Date:** 2025-07-21
**Context:**
The initial AI pipeline strategy involved using basic OCR (AWS Textract) to extract text, followed by an LLM for analysis. This approach proved insufficient as it loses critical layout, formatting, and structural information from medical documents. The core question is how to best process visual documents (PDFs, images) to achieve the project's non-negotiable requirements for accuracy (>99.5%), traceability (100%), and patient safety. Two primary architectural patterns were considered: a single-stage "All-in-One" multimodal model approach, and a multi-stage "Specialist" pipeline.

**Decision:**
We will adopt a multi-stage "Specialist" pipeline architecture. This involves two distinct phases:
1.  **Phase 1 (Intelligent Parsing):** Use a specialized, pre-trained service (specifically, Google Cloud Document AI with the `Healthcare OCR` processor) to convert the source document into a highly structured JSON object that includes text, tables, key-value pairs, and their precise bounding box coordinates.
2.  **Phase 2 (Reasoning & Enrichment):** Use the structured JSON from Phase 1 as the input for a powerful Large Language Model (e.g., Gemini 1.5 Pro, GPT-4o). The LLM's role is to reason over this pre-parsed data and populate the final database schema, not to perform OCR itself.

This architecture was chosen because it is superior across all key project metrics: accuracy, cost, traceability, speed, and maintainability.

**Consequences:**
*   **Positive:**
    *   **Highest Accuracy:** Decoupling parsing from reasoning significantly reduces the risk of transcription and structural errors, which is critical for patient safety.
    *   **Guaranteed Traceability:** The use of a specialized parser that outputs bounding box coordinates makes the 100% data traceability requirement straightforward to implement.
    *   **Lower Cost & Latency:** This pipeline is significantly cheaper and faster than sending large, raw images to expensive multimodal models for every task.
    *   **Improved Debugging:** Errors can be isolated to either the parsing stage or the reasoning stage, simplifying troubleshooting and improvement cycles.
    *   **Future-Proof:** This modular approach allows for swapping out either the parser or the reasoning model independently as technology evolves.
*   **Negative:**
    *   **Slightly Increased Complexity:** This architecture involves two distinct steps and potentially two separate cloud service integrations (Google Cloud and the LLM provider). However, this complexity is justified by the massive gains in reliability and accuracy.
    *   **New Dependency:** The project will now have a dependency on the Google Cloud Platform.

---

## Architectural Comparison: All-in-One vs. Specialist Pipeline

The following table details the rationale behind this decision, comparing the chosen "Specialist" architecture against the "All-in-One" multimodal alternative.

### The Contenders

**Architecture A: The "All-in-One" Multimodal Approach**
*   **Pipeline:** `Document Upload -> Multimodal LLM -> Structured Data`
*   **How it works:** Send the raw image of the document directly to a single, powerful multimodal model (like GPT-4o or Gemini 1.5 Pro). Ask it to do everything in one step: read the text, understand the layout, identify the medical entities, and output the final, structured JSON.

**Architecture B: The "Specialist" Multi-Stage Pipeline (Chosen)**
*   **Pipeline:** `Document Upload -> Google Document AI -> LLM -> Structured Data`
*   **How it works:**
    1.  **Parsing Stage:** Use a specialized tool (Google Document AI Healthcare OCR) to convert the visual document into a highly structured JSON object (with text, tables, and coordinates).
    2.  **Reasoning Stage:** Send the *structured JSON* (not the image) to a powerful LLM. Its job is to reason over the pre-parsed data and format it for the database.

### Head-to-Head Comparison

| Feature | Architecture A (All-in-One Multimodal) | Architecture B (Specialist Multi-Stage) | Winner & Why |
| :--- | :--- | :--- | :--- |
| **Critical Accuracy (>99.5%)** | **Lower & Less Reliable.** Multimodal models are phenomenal generalists but are not specifically fine-tuned on medical document layouts. They can make subtle but critical errors in transcription or table interpretation. | **Higher & More Reliable.** Google's Healthcare OCR is a specialist model trained for this exact task. Separating "seeing" from "reasoning" dramatically reduces parsing errors, leading to a more accurate final output. | **Architecture B** |
| **Data Traceability (100%)** | **Difficult to Guarantee.** Getting precise, reliable bounding box coordinates for every extracted entity is not a standard or guaranteed feature of general-purpose multimodal models. | **Built-in & Guaranteed.** This is a core feature of Document AI. It is designed to provide precise coordinates, making the 100% traceability requirement trivial to implement. | **Architecture B** |
| **Cost** | **Significantly Higher.** Processing raw images with top-tier multimodal models is expensive. A single high-resolution page can consume tens of thousands of tokens. | **Significantly Lower.** Document AI has a flat per-page cost. The subsequent text-only call to the LLM is much cheaper than sending a large image token load. | **Architecture B** |
| **Speed & Latency** | **Slower.** Multimodal models take longer to process large image inputs compared to text inputs. | **Faster.** The specialized Document AI parser is highly optimized. The subsequent text-only LLM call is also very fast. Total pipeline latency is lower. | **Architecture B** |
| **Error Handling** | **Opaque.** If the model makes a mistake, it's hard to know why. Was it an OCR error or a reasoning error? Debugging is a black box. | **Transparent.** Errors can be isolated to either the parsing stage or the reasoning stage. This makes debugging and improving the system much easier. | **Architecture B** |
