/**
 * Shared log schema for Worker (Node) and Edge Functions (Deno)
 * Ensures consistent structure across all logging systems
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export interface BaseLogEntry {
    timestamp: string;
    level: LogLevel;
    context: string;
    correlation_id?: string;
    message: string;
    worker_id?: string;
    job_id?: string;
    shell_file_id?: string;
    patient_id_masked?: string;
    duration_ms?: number;
    metadata?: Record<string, any>;
}
export interface LoggerOptions {
    context: string;
    worker_id?: string;
    correlation_id?: string;
    enable_sampling?: boolean;
    sample_rate?: number;
}
export interface RedactionOptions {
    patient_id?: string;
    ocr_text?: string;
    prompt?: string;
    base64?: string;
}
//# sourceMappingURL=logger-types.d.ts.map