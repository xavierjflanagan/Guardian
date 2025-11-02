/**
 * Pass 0.5: Healthcare Encounter Discovery
 * Main Entry Point
 *
 * PURPOSE:
 * 1. Review ENTIRE document (all pages)
 * 2. Detect and classify encounters
 * 3. Determine batch separation points for downstream processing
 *
 * CURRENT IMPLEMENTATION:
 * - Processes files of any size (no hardcoded page limit)
 * - Batch boundary detection: Not yet implemented (returns null)
 * - GPT-5 token limit: Unknown (testing in progress)
 *
 * FUTURE CONSIDERATION (100+ page files):
 * - If file exceeds GPT-5 input token limit, may need "pre-batching"
 * - Pre-batching would split file BEFORE Pass 0.5 (rough cuts)
 * - Then Pass 0.5 runs on each pre-batch to determine real batch boundaries
 * - Without pre-batching, very large files may fail at GPT-5 token ceiling
 */
import { Pass05Input, Pass05Output } from './types';
export type { Pass05Input, Pass05Output } from './types';
export declare function runPass05(input: Pass05Input): Promise<Pass05Output>;
//# sourceMappingURL=index.d.ts.map