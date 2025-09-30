# R&D Proposal: Grid-Based Spatial Extraction

**Status:** Future Research & Development Idea
**Priority:** Low - For exploration after Phase 2+ (OCR+AI Fusion) is implemented.
**Author:** Gemini (based on a proposal by the user)

---

## 1. Executive Summary

This document outlines an innovative, alternative approach to solving the spatial-semantic fusion problem by using a grid-based coordinate system overlaid directly onto document images. This method aims to leverage a single AI model's vision capabilities to extract both semantic facts and spatial locations, potentially bypassing the need for a separate OCR service.

**This approach is currently considered experimental.** It carries significant implementation and reliability risks compared to the primary [OCR + AI Fusion](./spatial-semantic-fusion-analysis.md) strategy. It is documented here for future exploration and R&D.

---

## 2. Core Concept: The Grid Overlay

The fundamental idea is to pre-process every document image by overlaying a high-resolution grid with alphanumeric identifiers for each cell (e.g., A1, A2... Z99).

The AI model would then be prompted to perform two tasks simultaneously:
1.  **Semantic Extraction:** Extract the clinical fact as usual (e.g., "Medication: Aspirin 81mg").
2.  **Spatial Identification:** Identify and list the grid cells that contain the text supporting that fact (e.g., "Supporting Text found in cells: H23, H24, I23, I24").

A backend system, knowing the exact pixel coordinates of every grid cell, would translate these identifiers into a traditional bounding box `GEOMETRY` for storage and use in the frontend.

```
Image → [Pre-processing: Add Grid Overlay] → AI Model → {Fact + Grid Coordinates} → [Backend: Translate Grid to Bounding Box] → Database
```

---

## 3. Potential Advantages (Pros)

*   **Simplified Pipeline:** Could potentially eliminate the OCR service, reducing the pipeline to a single AI call.
*   **Cost Reduction:** May reduce costs by removing the OCR step (though this could be offset by increased token usage in the AI call).
*   **AI-Native Solution:** Works with the AI's vision capabilities directly, rather than relying on post-processing and text-matching algorithms.

---

## 4. Challenges and Significant Risks (Cons)

*   **Precision vs. Granularity Trade-off:** This is the primary technical hurdle.
    *   A **coarse grid** is easy for the AI to read but provides imprecise locations, unsuitable for highlighting specific text.
    *   A **fine grid** offers better precision but clutters the document with visual noise, potentially confusing the AI and degrading its primary extraction performance. It also makes the list of grid cells for a single fact very long.
*   **AI Reliability and Brittleness:** This approach relies on the AI learning a new, complex, and arbitrary task. Its performance is unknown.
    *   The model could easily miss a grid cell for a fact that spans multiple cells, resulting in an incomplete or incorrect bounding box.
    *   This turns a core feature into a significant R&D project with an uncertain outcome.
*   **Prompt and Model Complexity:** Asking the AI to perform both semantic extraction and spatial grid mapping simultaneously increases cognitive load and could degrade the quality of both outputs.
*   **Preprocessing Overhead:** Adds a mandatory image manipulation step to the start of the pipeline.

---

## 5. Comparison to OCR + AI Fusion

| Aspect | OCR + AI Fusion (Primary) | Grid Overlay (R&D) |
| :--- | :--- | :--- |
| **Reliability** | **High.** Builds on mature, predictable OCR technology. | **Low.** Relies on unproven AI capability for a novel task. |
| **Precision** | **Pixel-perfect.** Provided directly by the OCR engine. | **Variable.** Limited by grid resolution. |
| **Risk** | **Low.** Main challenge is a solvable text-matching problem. | **High.** A research project with uncertain viability. |
| **Implementation** | **Clear Path.** Uses standard tools and libraries. | **Unclear.** Requires significant experimentation and tuning. |

---

## 6. Proposed Experiment for a Proof of Concept (PoC)

If this idea is pursued in the future, the following steps would be necessary to validate its feasibility:

1.  **Develop a Grid Overlay Utility:** Create a script to apply grids of varying resolutions to a sample set of documents.
2.  **Craft Experimental Prompts:** Design prompts that instruct the AI to perform the dual-extraction task.
3.  **Select a Validation Set:** Use a small set of 10-20 diverse documents from the project's "golden dataset."
4.  **Run the Experiment:** Process the gridded documents with the experimental prompts.
5.  **Analyze the Results:**
    *   How accurate is the clinical fact extraction compared to the non-gridded baseline?
    *   How accurate and consistent is the spatial grid identification?
    *   What is the impact on token count and cost?
    *   Qualitatively assess failure modes.

Based on the results of this PoC, a decision could be made on whether to invest further R&D effort into this approach.
