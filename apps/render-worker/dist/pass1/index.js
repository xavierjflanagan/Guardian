"use strict";
/**
 * Pass 1 Entity Detection - Public API
 * Created: 2025-10-03
 * Purpose: Clean exports for Pass 1 module
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPass1DatabaseRecords = exports.PASS1_SYSTEM_MESSAGE = exports.generatePass1ClassificationPrompt = exports.formatRecordSummary = exports.generateRecordStatistics = exports.validateRecordBatch = exports.validateEntityRecord = exports.batchEntityRecords = exports.translateAIOutputToDatabase = exports.ENTITY_SCHEMA_MAPPING = exports.validateSchemaMapping = exports.getUniqueSchemas = exports.requiresPass2Enrichment = exports.assessEnrichmentComplexity = exports.determineProcessingPriority = exports.assignEntitySchemas = exports.Pass1EntityDetector = void 0;
// Main class
var Pass1EntityDetector_1 = require("./Pass1EntityDetector");
Object.defineProperty(exports, "Pass1EntityDetector", { enumerable: true, get: function () { return Pass1EntityDetector_1.Pass1EntityDetector; } });
// Schema mapping functions
var pass1_schema_mapping_1 = require("./pass1-schema-mapping");
Object.defineProperty(exports, "assignEntitySchemas", { enumerable: true, get: function () { return pass1_schema_mapping_1.assignEntitySchemas; } });
Object.defineProperty(exports, "determineProcessingPriority", { enumerable: true, get: function () { return pass1_schema_mapping_1.determineProcessingPriority; } });
Object.defineProperty(exports, "assessEnrichmentComplexity", { enumerable: true, get: function () { return pass1_schema_mapping_1.assessEnrichmentComplexity; } });
Object.defineProperty(exports, "requiresPass2Enrichment", { enumerable: true, get: function () { return pass1_schema_mapping_1.requiresPass2Enrichment; } });
Object.defineProperty(exports, "getUniqueSchemas", { enumerable: true, get: function () { return pass1_schema_mapping_1.getUniqueSchemas; } });
Object.defineProperty(exports, "validateSchemaMapping", { enumerable: true, get: function () { return pass1_schema_mapping_1.validateSchemaMapping; } });
Object.defineProperty(exports, "ENTITY_SCHEMA_MAPPING", { enumerable: true, get: function () { return pass1_schema_mapping_1.ENTITY_SCHEMA_MAPPING; } });
// Translation functions
var pass1_translation_1 = require("./pass1-translation");
Object.defineProperty(exports, "translateAIOutputToDatabase", { enumerable: true, get: function () { return pass1_translation_1.translateAIOutputToDatabase; } });
Object.defineProperty(exports, "batchEntityRecords", { enumerable: true, get: function () { return pass1_translation_1.batchEntityRecords; } });
Object.defineProperty(exports, "validateEntityRecord", { enumerable: true, get: function () { return pass1_translation_1.validateEntityRecord; } });
Object.defineProperty(exports, "validateRecordBatch", { enumerable: true, get: function () { return pass1_translation_1.validateRecordBatch; } });
Object.defineProperty(exports, "generateRecordStatistics", { enumerable: true, get: function () { return pass1_translation_1.generateRecordStatistics; } });
Object.defineProperty(exports, "formatRecordSummary", { enumerable: true, get: function () { return pass1_translation_1.formatRecordSummary; } });
// Prompt functions (if needed externally)
var pass1_prompts_1 = require("./pass1-prompts");
Object.defineProperty(exports, "generatePass1ClassificationPrompt", { enumerable: true, get: function () { return pass1_prompts_1.generatePass1ClassificationPrompt; } });
Object.defineProperty(exports, "PASS1_SYSTEM_MESSAGE", { enumerable: true, get: function () { return pass1_prompts_1.PASS1_SYSTEM_MESSAGE; } });
// Database builder
var pass1_database_builder_1 = require("./pass1-database-builder");
Object.defineProperty(exports, "buildPass1DatabaseRecords", { enumerable: true, get: function () { return pass1_database_builder_1.buildPass1DatabaseRecords; } });
//# sourceMappingURL=index.js.map