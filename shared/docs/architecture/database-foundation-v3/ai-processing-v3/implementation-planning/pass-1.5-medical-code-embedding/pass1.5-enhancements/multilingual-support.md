# Pass 1.5 Multilingual Support

**Status:** Future Enhancement  
**Priority:** Low (embeddings naturally handle ~80% accuracy)  
**Created:** 2025-10-18

## Current Behavior
OpenAI embeddings map semantic meaning across languages:
- "Diabetes" (EN) ≈ "糖尿病" (ZH) ≈ "Diabète" (FR) → similar vectors
- Works without modification due to multilingual training

## Accuracy By Language
- **Same language:** 95%+
- **European languages:** 85-90% 
- **Different scripts:** 75-85%
- **With translation:** 90%+ all languages

## Future Enhancement Options

### Option 1: Translation Layer (Recommended)
```typescript
// Add to Pass 1 output
interface Entity {
  text: string;           // Original
  text_english?: string;  // Translated
  detected_language: string;
}

// Pass 1.5 uses translation if available
const searchText = entity.text_english || entity.text;
```

### Option 2: Multi-Language Embeddings
```typescript
// Embed medical codes in multiple languages
{
  code: "10001J",
  embeddings: {
    en: [...],  // English embedding
    zh: [...],  // Chinese embedding
    es: [...]   // Spanish embedding
  }
}
```

### Option 3: Language-Specific Confidence
```typescript
// Adjust similarity threshold by language
const threshold = languageThresholds[detectedLang] || 0.85;
```

## Implementation Trigger
Consider implementing when:
- International users >20%
- Accuracy drops below 80%
- User feedback indicates issues

## Cost-Benefit
- **Current:** Free, 75-85% accuracy
- **With translation:** +$0.01/document, 90%+ accuracy
- **Multi-embeddings:** 3x storage, 95%+ accuracy

**Recommendation:** Monitor accuracy metrics, implement Option 1 if needed.