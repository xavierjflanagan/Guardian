# Archived AI Processing Documentation

**Purpose:** Historical documentation from previous AWS Textract-based architecture  
**Archive Date:** August 18, 2025  
**Reason:** Migration to AI-first multimodal processing with intake screening

---

## 📋 **Archive Contents**

This folder contains documentation from Guardian's previous AI processing architecture, which was primarily based on AWS Textract for OCR processing followed by AI extraction.

### **Previous Architecture (v6.x)**
- **Primary OCR**: AWS Textract (~$250/1K documents)
- **AI Processing**: Text-based extraction after OCR
- **Pipeline**: Sequential OCR → AI → Storage workflow
- **Cost Structure**: High due to expensive OCR processing

### **Migration Rationale**
The architecture was updated in August 2025 to implement:
- **AI-First Multimodal**: Process raw documents directly with AI vision
- **Intake Screening**: Identity verification and content classification upfront
- **OCR as Adjunct**: Optional Google Cloud Vision for text context
- **Cost Optimization**: 85%+ cost reduction through smart provider routing

---

## 🔄 **Architecture Evolution**

### **Previous Workflow (Archived)**
```
Upload → AWS Textract OCR → AI Text Analysis → Storage
```

### **New Workflow (Current)**
```
Upload → Intake Screening → AI-First Vision → Optional OCR Adjunct → Storage
```

---

## 📚 **Historical Documentation**

*Note: Original documentation files would be moved here during migration.*

### **Legacy Components**
- AWS Textract integration specifications
- Text-based AI extraction prompts
- Sequential processing pipeline designs
- Cost analysis based on expensive OCR

### **Lessons Learned**
- OCR-first approach was cost-prohibitive at scale
- AI vision models provide superior medical document understanding
- Upfront screening significantly reduces processing costs
- Multi-provider flexibility essential for healthcare compliance

---

## ⚠️ **Important Notes**

- **Do Not Use**: This archived documentation is for reference only
- **Current Documentation**: See parent directory for active architecture
- **Migration Date**: All active development moved to new architecture August 18, 2025
- **Support**: Legacy architecture no longer supported or maintained

---

*For current AI processing documentation, see the main [AI Processing README](../README.md)*