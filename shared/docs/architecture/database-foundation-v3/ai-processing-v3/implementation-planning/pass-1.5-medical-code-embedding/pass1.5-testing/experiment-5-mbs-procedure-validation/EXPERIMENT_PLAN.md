# Experiment 5: Quick Reference Plan

**Goal:** Determine if OpenAI embeddings are good enough for MBS procedure matching, or if we need specialized handling like medications.

---

## The Question

**Can we use simple OpenAI vector search for procedures, or do we need something fancier?**

Current assumption (unvalidated): OpenAI is fine for MBS procedures
Medication lesson (validated): OpenAI NOT fine, needed SapBERT + hybrid search

---

## 4-Phase Experiment

### Phase 1: Create Test Data (2-4 hours)
**What:** 30-50 realistic procedure entities from medical documents
**Categories:** GP visits, diagnostic tests, imaging, minor procedures, surgery, allied health
**Output:** `test-data/realistic-procedure-entities.json` with ground truth MBS codes

### Phase 2: Test OpenAI Baseline (1-2 hours)
**What:** Run pure OpenAI vector search (current strategy)
**Script:** `scripts/test-openai-baseline.ts`
**Measure:** Top-1, Top-5, Top-20 accuracy

**Decision Tree:**
```
If Top-20 accuracy ≥90%:
  → OpenAI is fine, keep simple vector search ✓
  → Mark procedure strategy as VALIDATED
  → Done!

If Top-20 accuracy 70-89%:
  → OpenAI is marginal, investigate improvements
  → Go to Phase 3

If Top-20 accuracy <70%:
  → OpenAI is insufficient, need specialized approach
  → Go to Phase 3
```

### Phase 3: Fix the Problem (2-4 hours, IF NEEDED)

**Only if Phase 2 fails (<90% accuracy)**

Test alternative strategies:

**Option A: Medical Domain Models**
- BioBERT embeddings
- Clinical-ModernBERT embeddings
- Compare vs OpenAI

**Option B: Hybrid Search (like medications)**
- Lexical filtering on procedure type + anatomy
- Vector reranking
- Gradient candidate system

**Option C: Anatomy Extraction**
- Parse: [anatomy] + [procedure]
- Filter by anatomy first
- Handle left/right/bilateral

### Phase 4: Make Recommendation (1 hour)
**Output:** Update `PASS-1.5-MASTER-PLAN.md` with:
- Procedure strategy status: VALIDATED or NEEDS UPGRADE
- Specific embedding model to use
- Whether hybrid search is required
- Implementation notes

---

## Expected Outcomes

### Scenario 1: OpenAI Works (Best Case)
- Top-20 accuracy ≥90%
- Keep simple vector search
- No code changes needed
- Mark as validated, move on

### Scenario 2: OpenAI Marginal
- Top-20 accuracy 70-89%
- Investigate specific failure patterns
- Maybe hybrid search for edge cases
- Gradient system like medications

### Scenario 3: OpenAI Fails
- Top-20 accuracy <70%
- Upgrade to domain model (BioBERT)
- Implement hybrid search
- Full strategy redesign

---

## Comparison to Medications (Experiment 4)

**Medications:**
- Semantic only: 73.3% success
- Failed on: Brand names, missing dose
- Solution: SapBERT + hybrid search + gradient candidates
- Expected result: 95%+ success

**Procedures (this experiment):**
- Semantic only: ??? (testing now)
- Potential failures: Anatomy variations, synonyms, abbreviations
- Solution: TBD based on results
- Target: ≥90% success

---

## Timeline

**Optimistic:** 6 hours (OpenAI works, no fixes needed)
**Realistic:** 8-9 hours (some failures, test alternatives)
**Pessimistic:** 11 hours (major redesign required)

---

## File Structure Created

```
experiment-5-mbs-procedure-validation/
├── README.md              ← Full detailed plan
├── EXPERIMENT_PLAN.md     ← This quick reference
├── test-data/             ← Test entities go here
├── scripts/               ← Test scripts go here
└── results/               ← Results go here (create when needed)
```

---

## Next Action

**Start with Phase 1:** Create `test-data/realistic-procedure-entities.json`

Should include:
- 30-50 realistic procedure entities
- Ground truth MBS code for each
- Entity categories (GP, diagnostic, imaging, etc.)
- Edge cases (anatomy variations, abbreviations)

**Source options:**
1. Extract from real Pass 1 outputs (if available)
2. Manually create based on common procedures
3. Review actual MBS codes and reverse-engineer realistic queries

---

## Decision Points

**After Phase 2:**
```
OpenAI Top-20 Accuracy:
  ≥90% → DONE, mark validated
  70-89% → Continue to Phase 3, test improvements
  <70% → Continue to Phase 3, major changes needed
```

**After Phase 3 (if needed):**
```
Which strategy performs best?
  → Document in ANALYSIS_SUMMARY.md
  → Update PASS-1.5-MASTER-PLAN.md
  → Implement in worker code
```
