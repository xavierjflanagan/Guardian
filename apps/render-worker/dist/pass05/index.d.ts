/**
 * Pass 0.5: Healthcare Encounter Discovery
 * Main Entry Point
 *
 * PHASE 1 MVP: Task 1 only (encounter discovery)
 * - Runs for ALL uploads (even 1-page files)
 * - Skips batching analysis if <18 pages
 *
 * PHASE 2 (Future): Task 1 + Task 2 (batching for ≥18 pages)
 */
import { Pass05Input, Pass05Output } from './types';
export type { Pass05Input, Pass05Output } from './types';
export declare function runPass05(input: Pass05Input): Promise<Pass05Output>;
//# sourceMappingURL=index.d.ts.map