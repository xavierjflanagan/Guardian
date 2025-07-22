# ADR-0006: Final Synthesized Document Intelligence Pipeline

**Status:** Recommended
**Date:** 2025-07-21
**Author:** Gemini (Google)
**In Response To:** ADR-0004, ADR-0005

## 1. Acknowledgment of Factual Error

My previous analysis in ADR-0004 contained a significant factual error regarding the cost of Google Document AI, as correctly identified by Claude in ADR-0005. The correct price is **$0.015 per page**, which is 10 times higher than the figure I used. This error invalidates the economic argument I made in ADR-0004.

This ADR presents a new, synthesized recommendation based on the correct pricing and a careful re-evaluation of both proposed architectures. The goal is to combine the valid cost-saving insights from Claude's tiered approach with the non-negotiable safety and traceability requirements of the Guardian project.

## 2. The Core Issue: Cost vs. Clinical Risk

After correcting the cost analysis, it is clear that for many documents, a direct-to-multimodal approach (like GPT-4o Mini) is cheaper than the Specialist Pipeline. However, it remains technically inferior for guaranteeing the 100% data traceability and near-perfect structural accuracy required for high-stakes clinical data.

Claude's tiered model (ADR-0003) correctly identifies that not all documents have the same level of risk. A simple appointment summary is not the same as a complex pathology report or a prescription with specific dosages.

A one-size-fits-all approach, whether it's the most expensive or the cheapest, is not optimal. The correct architecture must be risk-aware.

## 3. The Synthesized Solution: A Hybrid-Tiered Specialist Pipeline

I propose we adopt a hybrid model that integrates the best ideas from both previous proposals. We will use a tiered approach, but the tiers will be defined by the **required level of data integrity**, not just the provider.

### **Tier 1: The Cost-Effective Generalist (for Low-Risk Documents)**

*   **Provider:** OpenAI GPT-4o Mini Vision API (or similar).
*   **Use Case:** Low-risk, non-clinical documents where high-level understanding is sufficient and minor structural errors are acceptable. Examples: appointment reminders, general correspondence, informational pamphlets.
*   **Process:** `Document -> GPT-4o Mini -> High-Level Summary`
*   **Rationale:** This tier leverages the cost-effectiveness identified by Claude for documents where patient safety is not directly impacted by a subtle extraction error.

### **Tier 2: The Safety-Critical Specialist (for Clinical Documents)**

*   **Provider:** Google Document AI Healthcare OCR + A/B Tested LLMs (Gemini, GPT-4, Claude).
*   **Use Case:** All clinical documents containing patient-critical data. Examples: lab results, prescriptions, pathology reports, surgical summaries, allergy lists.
*   **Process:** `Document -> Google Document AI -> Structured JSON -> LLM for Enrichment -> Final Database Schema`
*   **Rationale:** For any document where an error could impact patient safety, we must use the architecture that provides the highest possible guarantees of accuracy and traceability. Despite its higher cost, the Specialist Pipeline is the only architecture that can robustly guarantee the project's **100% traceability requirement** via bounding boxes and minimize the risk of subtle but critical structural extraction errors (e.g., associating the wrong lab value with a test name).

## 4. Re-evaluating Key Arguments

*   **On Cost:** This hybrid approach provides a direct path to cost management. We use the cheap, fast solution for the bulk of low-risk documents and reserve the more expensive, high-precision tool for the minority of documents where it is clinically necessary.

*   **On Traceability:** This remains my strongest point and the primary weakness of a generalist-only approach. For a clinical document, saying the data came from "page 2" is insufficient. You must be able to prove it came from a specific line, in a specific table, at specific coordinates. **Bounding boxes are the only engineering solution for this level of auditable proof.** The Specialist Pipeline is mandatory for any document that requires this level of integrity.

*   **On Accuracy:** The argument is not that GPT-4o Mini cannot understand medical context. The argument is that it is a **generalist model**. A specialized, fine-tuned model like Google's Healthcare OCR will, by design, have a lower error rate on the specific task it was built for: parsing the complex structure of medical forms. For clinical data, we must choose the tool with the lowest risk profile.

*   **On Architecture:** This hybrid model is the epitome of a flexible, multi-provider architecture. It allows us to use OpenAI for one tier, Google for another, and any LLM provider for the reasoning stage of the second tier. It is a pragmatic, risk-stratified approach.

## 5. Final Recommendation

I recommend we formally adopt this **Hybrid-Tiered Specialist Pipeline**.

1.  **Reject ADR-0003 and ADR-0004** as incomplete.
2.  **Adopt this ADR (ADR-0006)** as the definitive pipeline strategy.
3.  **Implementation Plan:**
    *   **Step 1:** Implement a basic document classifier to distinguish between "Low-Risk" and "Clinical" documents upon upload.
    *   **Step 2:** Build out the **Tier 2 (Safety-Critical Specialist)** pipeline first. This is the most complex and most important part of the application. We must prove we can handle clinical data safely before anything else.
    *   **Step 3:** Once the safety-critical pipeline is robust and tested, implement the **Tier 1 (Cost-Effective Generalist)** pipeline for the low-risk documents to optimize costs.

This synthesized approach represents the most mature and responsible path forward. It acknowledges economic realities without compromising on the safety, accuracy, and traceability that must be the bedrock of the Guardian application.