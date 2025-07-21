# AWS Textract vs Google Cloud Vision OCR: Comparison for AI Document Pipeline

This markdown compares **AWS Textract** and **Google Cloud Vision OCR**, specifically for use in healthcare document pipelines where the goal is to extract structured data (text, tables, fields) and pass it to LLMs (e.g. Claude, GPT-4o) for JSON transformation and downstream storage.

---

## 📊 Feature Comparison

| Feature                         | **AWS Textract**                         | **Google Cloud Vision OCR**                   |
|----------------------------------|-------------------------------------------|-----------------------------------------------|
| **Provider**                    | Amazon Web Services                      | Google Cloud                                  |
| **Pricing**                     | $0.015–$0.065/page (forms + tables)      | $0.0015/page (OCR only); $0.03+/page (Form Parser) |
| **OCR Accuracy (printed text)** | ✅ Good                                   | ✅ Excellent                                   |
| **Handwriting Support**         | ✅ Good (limited)                         | ✅ Very strong                                 |
| **Form Parsing**                | ✅ Built-in (key-value pairs)             | ✅ Via Form Parser (extra cost)                |
| **Table Parsing**               | ✅ Supported                              | ✅ Supported via Form Parser                   |
| **Layout Awareness**            | ✅ Moderate (fields, tables)              | ✅ Good (bounding boxes, layout blocks)        |
| **Multilingual Support**        | ⚠️ Limited (~7+ languages)               | ✅ Extensive (120+ languages)                  |
| **Vision API Extras**           | ❌ None                                   | ✅ Logos, handwriting, object detection        |
| **Structured Output**           | ✅ JSON with keys and tables              | ✅ JSON with layout metadata                   |
| **Ease of Use**                 | ⚠️ Requires AWS setup                     | ✅ Simple REST/SDK API                         |
| **Scalability**                 | ✅ Serverless, batch-friendly             | ✅ Serverless, fast                            |
| **LLM Compatibility**           | ✅ JSON works well                        | ✅ JSON + layout works well                    |

---

## 💰 Cost Comparison (per 5-page document)

| Scenario                          | **Textract**               | **Google Cloud Vision OCR**       |
|-----------------------------------|----------------------------|-----------------------------------|
| OCR only                          | ~$0.05                     | **$0.0075**                       |
| OCR + Tables                      | ~$0.075                    | ~$0.1575 (Form Parser)            |
| OCR + Forms                       | ~$0.25                     | ~$0.1575 (Form Parser)            |
| OCR + Tables + Forms + Queries    | ~$0.325–$0.40              | ~$0.1575–$0.30 (with add-ons)     |

---

## ✅ Pros & Cons Summary

### AWS Textract

**Pros:**
- Integrated form & table detection
- Native AWS integration
- Structured JSON output

**Cons:**
- Higher per-page cost
- Less accurate with messy layouts
- Limited handwriting and language support

---

### Google Cloud Vision OCR

**Pros:**
- Very low cost OCR ($0.0015/page)
- Excellent printed & handwritten accuracy
- Full layout metadata with bounding boxes
- Great pairing with LLMs (Claude, GPT-4o, Gemini)

**Cons:**
- Form parsing requires add-on (extra cost)
- No direct equivalent to Textract "queries"

---

## ✅ Recommendation by Use Case

| Use Case                                      | Recommended Tool            |
|-----------------------------------------------|-----------------------------|
| Clean printed documents                        | ✅ Google Vision OCR        |
| Handwriting or mixed scans                     | ✅ Google or Textract       |
| Need form/table parsing out of the box         | ✅ Textract                 |
| Need lowest OCR cost at scale                  | ✅ Google Vision OCR        |
| Already using AWS infrastructure               | ✅ Textract                 |
| Pairing with LLMs for flexible schema output   | ✅ Google (better layout)   |

---

## 💡 Hybrid Strategy (Optional)

1. Use **Google Vision OCR** for most docs (cheap, accurate).
2. Use **Textract** only for complex forms requiring built-in queries or deeper field parsing.
3. Use an **LLM layer (Claude, GPT-4o)** to turn OCR text + layout into labeled JSON records.

This gives you the best balance of cost, flexibility, and structure.

