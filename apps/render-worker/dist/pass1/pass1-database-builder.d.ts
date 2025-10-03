/**
 * Pass 1 Database Builder - Creates ALL Pass 1 Database Records
 * Created: 2025-10-03
 * Purpose: Build complete Pass 1 database records for all 7 tables per bridge schemas
 *
 * Pass 1 writes to 7 tables:
 * 1. ai_processing_sessions (CREATE)
 * 2. entity_processing_audit (CREATE multiple)
 * 3. shell_files (UPDATE)
 * 4. profile_classification_audit (CREATE)
 * 5. pass1_entity_metrics (CREATE)
 * 6. ai_confidence_scoring (CREATE multiple, optional)
 * 7. manual_review_queue (CREATE multiple, optional)
 */
import { Pass1AIResponse, Pass1Input, ProcessingSessionMetadata, AIProcessingSessionRecord, ProfileClassificationAuditRecord, Pass1EntityMetricsRecord, ShellFileUpdateFields, AIConfidenceScoringRecord, ManualReviewQueueRecord, EntityAuditRecord } from './pass1-types';
export interface Pass1DatabaseRecords {
    ai_processing_session: AIProcessingSessionRecord;
    entity_processing_audit: EntityAuditRecord[];
    shell_file_updates: ShellFileUpdateFields;
    profile_classification_audit: ProfileClassificationAuditRecord;
    pass1_entity_metrics: Pass1EntityMetricsRecord;
    ai_confidence_scoring: AIConfidenceScoringRecord[];
    manual_review_queue: ManualReviewQueueRecord[];
}
/**
 * Build complete Pass 1 database records from AI response
 */
export declare function buildPass1DatabaseRecords(input: Pass1Input, aiResponse: Pass1AIResponse, sessionMetadata: ProcessingSessionMetadata, entityAuditRecords: EntityAuditRecord[]): Pass1DatabaseRecords;
//# sourceMappingURL=pass1-database-builder.d.ts.map